// 화면에 표시된 공개 텍스트를 복사하고 제한된 환경에서는 직접 복사를 안내한다
export async function copyField(field, button, status) {
  if (!field?.value || button.disabled) return false;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  status.textContent = '';
  let copied = false;
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = '복사했습니다.';
    copied = true;
  } catch {
    field.focus();
    field.select();
    status.textContent = '자동 복사가 제한돼 내용을 선택했습니다. 선택한 내용을 직접 복사해 주세요.';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
  return copied;
}
