"""초안 누락 복구가 날짜·원문 범위·검사 증거를 보존하는지 확인한다."""
import copy
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch

REPO = Path(__file__).resolve().parents[2]
for folder in ('dev/pipeline/collect', 'dev/pipeline/publish', 'dev/tools'):
    sys.path.insert(0, str(REPO / folder))
import compose_issue
import install_browser
import publish_pending


class SupplementIssueTest(unittest.TestCase):
    def setUp(self):
        self.template = json.loads((REPO / 'dev/web/data/issues/2026-11-09.json').read_text())
        self.now = dt.datetime(2026, 11, 12, 7, 30, tzinfo=dt.timezone(dt.timedelta(hours=9)))
        self.item = {'outlet': '테스트 매체', 'title': '서울 공공도서관 운영 안내', 'url': 'https://example.org/news?utm_source=rss', 'published': '2026-11-11T10:00+09:00'}

    def test_future_http_duplicate_and_opinion_are_excluded(self):
        items = [self.item, self.item, {**self.item, 'url': 'http://example.org/old'}, {**self.item, 'published': '2026-11-12T00:00+09:00'}, {**self.item, 'published': '2026-11-10T23:59+09:00'}, {**self.item, 'title': '[사설] 주장', 'url': 'https://example.org/opinion'}]
        result = compose_issue.prepare_items({'items': items}, '2026-11-12')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], 'https://example.org/news')
        self.assertFalse(result[0]['body_read'])

    def test_new_titles_do_not_relabel_old_numbers_or_reviews(self):
        before = copy.deepcopy(self.template)
        issue = compose_issue.compose(self.template, {'items': [self.item]}, '2026-11-12', self.now)
        self.assertEqual(self.template, before)
        self.assertEqual(issue['nums'], before['nums'])
        self.assertNotIn('review', issue)
        self.assertEqual(issue['status'], 'draft')
        self.assertEqual(issue['collectedAt'], self.now.isoformat(timespec='seconds'))
        self.assertEqual(issue['late']['cutoff'], '2026-11-11T23:59:59+09:00')
        self.assertNotEqual(issue['national']['items'], before['national']['items'])
        self.assertFalse(issue['themes'][0]['articles'][0]['read'])

    def test_no_feed_produces_a_disclosed_service_notice(self):
        issue = compose_issue.compose(self.template, {'items': []}, '2026-11-12', self.now)
        self.assertEqual(issue['national']['items'][0]['outlet'], '대한민국 조간')
        self.assertIn('수집 지연', issue['national']['items'][0]['title'])
        self.assertTrue(all('이전' in text or '수집' in text or '목표' in text or '날짜' in text for text in issue['limits']))
        self.assertEqual(issue['agenda'], [])
        self.assertTrue(all('확보하지 못했습니다' in text for text in issue['regions']['summary'].values()))

    def test_early_or_other_day_execution_does_not_create_a_misdated_issue(self):
        with self.assertRaisesRegex(ValueError, '오늘 호'):
            compose_issue.compose(self.template, {'items': []}, '2026-11-12', self.now - dt.timedelta(days=1))


class BrowserInstallationTest(unittest.TestCase):
    def test_existing_browser_avoids_package_repository_dependency(self):
        call = Mock(return_value=subprocess.CompletedProcess([], 0))
        self.assertEqual(install_browser.choose_browser(lambda name: '/usr/bin/google-chrome' if name == 'google-chrome' else None, call), '/usr/bin/google-chrome')
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0][-1], '--version')

    def test_transient_download_failure_is_retried_without_dropping_deps(self):
        call = Mock(side_effect=[subprocess.CalledProcessError(100, 'install'), subprocess.CompletedProcess([], 0)])
        pause = Mock()
        self.assertEqual(install_browser.choose_browser(lambda name: None, call, pause), '')
        self.assertEqual(call.call_count, 2)
        self.assertIn('--with-deps', call.call_args.args[0])
        pause.assert_called_once_with(10)

    def test_persistent_failure_remains_a_failure_after_three_attempts(self):
        call = Mock(side_effect=subprocess.TimeoutExpired('install', 180))
        with self.assertRaises(RuntimeError):
            install_browser.choose_browser(lambda name: None, call, Mock())
        self.assertEqual(call.call_count, 3)


class RecoveryProofTest(unittest.TestCase):
    def test_recent_recovery_window_crosses_month_and_keeps_chronological_order(self):
        self.assertEqual(publish_pending.recent_days('2026-12-02'), ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])

    def test_successful_exact_sha_proof_is_reused(self):
        sha = 'a' * 40
        checks = {'total_count': 1, 'check_runs': [{'id': 1, 'head_sha': sha, 'name': 'verify-ci', 'app': {'slug': 'github-actions'}, 'status': 'completed', 'conclusion': 'success'}]}
        with patch.object(publish_pending.auto_release, 'api', return_value=checks), patch.object(publish_pending, 'write_api') as writer, patch.object(publish_pending, 'run') as runner:
            publish_pending.verify_source(sha)
        writer.assert_not_called()
        runner.assert_not_called()

    def test_failed_full_check_is_never_recorded_as_success(self):
        with patch.object(publish_pending.auto_release, 'api', return_value={'total_count': 0, 'check_runs': []}), patch.object(publish_pending, 'write_api', return_value={'id': 123}) as writer, patch.object(publish_pending, 'run', side_effect=RuntimeError('검사 실패')), patch.dict('os.environ', {'GITHUB_RUN_ID': '100'}):
            with self.assertRaisesRegex(RuntimeError, '검사 실패'):
                publish_pending.verify_source('a' * 40)
            self.assertEqual(writer.call_args.args[1]['conclusion'], 'failure')
