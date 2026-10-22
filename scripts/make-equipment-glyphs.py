import cairosvg
S='stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" fill="none"'
G={
# Pulley on a mount, cable running down to a stirrup handle
'cable': f'''<line x1="48" y1="6" x2="48" y2="14" {S}/>
<circle cx="48" cy="26" r="12" {S}/><circle cx="48" cy="26" r="2.5" fill="#FFFFFF"/>
<line x1="60" y1="27" x2="60" y2="66" {S}/>
<path d="M60 66 L44 88 H76 Z" {S}/>''',
# Selectorised weight stack: guide rods, plates, pin
'machine': f'''<line x1="22" y1="8" x2="22" y2="88" {S}/><line x1="74" y1="8" x2="74" y2="88" {S}/>
<rect x="30" y="34" width="36" height="14" rx="3" {S}/>
<rect x="30" y="54" width="36" height="14" rx="3" {S}/>
<rect x="30" y="74" width="36" height="12" rx="3" {S}/>
<line x1="48" y1="8" x2="48" y2="34" {S}/><line x1="62" y1="61" x2="84" y2="61" {S}/>''',
}
for k,v in G.items():
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">{v}</svg>'
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f'equip_{k}.png', output_width=96, output_height=96)
