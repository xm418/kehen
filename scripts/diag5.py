"""验证 dist/index.html 能否被正确解析"""
from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.divs_in_body = []
        self.body_count = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.in_body = True
            self.body_count += 1
        elif self.in_body and tag == 'div':
            d = dict(attrs)
            self.divs_in_body.append(d.get('id', d.get('class', '(no id/class)')))
    def handle_endtag(self, tag):
        if tag == 'body':
            self.in_body = False

html = open(r'c:\Users\33973\Desktop\项目\dist\index.html', 'r', encoding='utf-8').read()
p = P()
p.feed(html)
print(f'body tags found: {p.body_count}')
print(f'divs in body: {p.divs_in_body}')
print(f'"root" div present: {"root" in p.divs_in_body}')
print(f'"boot-splash" div present: {"boot-splash" in p.divs_in_body}')

# Also parse with BeautifulSoup if available
try:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.body
    print(f'\nbs4 body exists: {body is not None}')
    if body:
        print(f'bs4 body children: {list(body.children)[:5]}')
        root = body.find(id='root')
        print(f'bs4 #root exists: {root is not None}')
except ImportError:
    print('\nbs4 not available')
