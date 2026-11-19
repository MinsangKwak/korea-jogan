export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(text, href, className) {
  const anchor = element('a', className, text);
  anchor.href = href;
  return anchor;
}

export function readingHeader(title, description) {
  const header = element('header', 'law-reading-head');
  const heading = element('h1', '', title);
  heading.tabIndex = -1;
  header.append(heading, element('p', '', description));
  return header;
}
