# 按站内实际用到的字，把 Noto Serif SC 裁成小体积 woff2。
# 用法：python3 tools/subset-font.py /path/to/NotoSerifSC.ttf   （先 node src/build.mjs）
import sys, glob, pathlib
from fontTools import subset
root = pathlib.Path(__file__).resolve().parent.parent
text = ''.join(p.read_text('utf-8') for p in list(root.glob('docs/**/*.html')) + list(root.glob('src/*.mjs')) + list(root.glob('static/js/*.js')))
chars = set(text) | set('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ¥·—…「」『』《》，。、：；！？（）')
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']
f = subset.load_font(sys.argv[1], opts)
s = subset.Subsetter(opts); s.populate(text=''.join(sorted(chars))); s.subset(f)
out = root / 'static/fonts/tome.woff2'
subset.save_font(f, str(out), opts)
print(len(chars), 'chars →', out, out.stat().st_size // 1024, 'KB')
