import cairosvg
G1, G2 = '#4BF08F', '#1FBF64'
def mark(scale=1.0, cx=512, cy=512, color=None, bar='#C9D2CD'):
    # Bar with three plates that grow left to right: a barbell and a rising chart in one.
    s = scale
    plates = [(-214, 270), (-74, 410), (66, 560)]  # x offset, height
    w = 96
    out = []
    fill = color or 'url(#g)'
    barc = color or bar
    out.append(f'<rect x="{cx-352*s}" y="{cy-20*s}" width="{704*s}" height="{40*s}" rx="{20*s}" fill="{barc}"/>')
    for x, h in plates:
        out.append(f'<rect x="{cx+x*s}" y="{cy-h/2*s}" width="{w*s}" height="{h*s}" rx="{30*s}" fill="{fill}"/>')
    return '\n'.join(out)
defs = f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{G1}"/><stop offset="1" stop-color="{G2}"/></linearGradient><radialGradient id="bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#18201C"/><stop offset="1" stop-color="#0A0C0B"/></radialGradient></defs>'
def svg(body, size=1024, bg=None):
    b = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">{defs}{b}{body}</svg>'
def png(name, s, px):
    cairosvg.svg2png(bytestring=s.encode(), write_to=name, output_width=px, output_height=px)
# iOS / store icon: full bleed, opaque
png('icon.png', svg(mark(1.0), bg='url(#bg)'), 1024)
# Android adaptive: foreground inside the 66% safe zone, solid background, monochrome
png('android-icon-foreground.png', svg(mark(0.62)), 512)
png('android-icon-background.png', svg('', bg='#0A0C0B'), 512)
png('android-icon-monochrome.png', svg(mark(0.62, color='#FFFFFF')), 432)
# Splash mark (transparent) and favicon
png('splash-icon.png', svg(mark(1.0)), 512)
png('favicon.png', svg(mark(1.0), bg='#0A0C0B'), 48)
