import React, { useMemo, useState } from 'react'
import { marked } from 'marked'

// ---------- helpers ----------
function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function makeExcerpt(md){
  const plain = (md||'')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^\)]*\)/g, '')
    .replace(/[*_#>`~-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.slice(0, 250) + (plain.length > 250 ? '…' : '')
}

function drawRoundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2)
  ctx.beginPath()
  ctx.moveTo(x+rr, y)
  ctx.arcTo(x+w, y,   x+w, y+h, rr)
  ctx.arcTo(x+w, y+h, x,   y+h, rr)
  ctx.arcTo(x,   y+h, x,   y,   rr)
  ctx.arcTo(x,   y,   x+w, y,   rr)
  ctx.closePath()
}

function loadImage(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

// Наносим водяной знак «Weazel News» (или то, что в brand)
async function applyWatermark(dataUrl, {
  brand = 'Weazel News',
  margin = 24,
  opacity = 0.72,
  maxW = 2400
} = {}) {
  const img = await loadImage(dataUrl)

  const scale = img.width > maxW ? maxW / img.width : 1
  const W = Math.round(img.width * scale)
  const H = Math.round(img.height * scale)

  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')

  ctx.drawImage(img, 0, 0, W, H)

  const fontSize = Math.max(16, Math.round(W * 0.018)) // ~1.8% ширины
  ctx.font = `700 ${fontSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial`
  const text = (brand || 'Weazel News').toUpperCase()
  const textW = Math.ceil(ctx.measureText(text).width)

  const padX = Math.round(fontSize * 0.8)
  const padY = Math.round(fontSize * 0.6)
  const boxW = textW + padX * 2
  const boxH = fontSize + padY * 2

  const x = W - margin - boxW
  const y = H - margin - boxH
  const radius = Math.round(boxH * 0.22)

  // мягкая тень
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#000'
  drawRoundRect(ctx, x + 2, y + 2, boxW, boxH, radius)
  ctx.fill()
  ctx.restore()

  // чёрная полупрозрачная плашка
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = '#000'
  drawRoundRect(ctx, x, y, boxW, boxH, radius)
  ctx.fill()
  ctx.restore()

  // белый текст
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${fontSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial`
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + boxH / 2)

  // JPEG с умеренной компрессией
  return c.toDataURL('image/jpeg', 0.92)
}

// ---------- component ----------
export default function App(){
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [author, setAuthor] = useState('Людмила Ясная-Хайзенберг')
  const [contributorsText, setContributorsText] = useState('') // каждый с новой строки
  const [tags, setTags] = useState('weazel, los_santos')
  const [brand, setBrand] = useState('Weazel News')
  const [markdown, setMarkdown] = useState('**Ночь, Лос-Сантос.** Я веду машину одна…')
  const [headerImage, setHeaderImage] = useState(null) // {name,dataUrl}
  const [gallery, setGallery] = useState([])           // [{name,dataUrl}]
  const [toCurators, setToCurators] = useState(true)
  const [autoWatermark, setAutoWatermark] = useState(true)
  const [msg, setMsg] = useState('')

  const html = useMemo(() => marked.parse(markdown || ''), [markdown])

  function fmtTags(){
    return (tags||'')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : '#'+t.replace(/\s+/g,'_'))
      .join(' ')
  }

  async function pickHeader(e){
    const f = e.target.files?.[0]
    if(!f) return
    const raw = await fileToDataURL(f)
    const stamped = autoWatermark ? await applyWatermark(raw, { brand: brand || 'Weazel News' }) : raw
    setHeaderImage({ name: f.name, dataUrl: stamped })
  }

  async function pickGallery(e){
    const files = Array.from(e.target.files || [])
    const out = []
    for(const f of files){
      const raw = await fileToDataURL(f)
      const stamped = autoWatermark ? await applyWatermark(raw, { brand: brand || 'Weazel News' }) : raw
      out.push({ name: f.name, dataUrl: stamped })
    }
    setGallery(prev => [...prev, ...out])
  }

  async function send(){
    if(!title.trim() || !markdown.trim()){
      alert('Нужны заголовок и текст')
      return
    }
    setMsg('Отправляю…')
    try{
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        author: author.trim(),
        tags: fmtTags(),
        brand,
        markdown,
        excerpt: makeExcerpt(markdown),
        to: toCurators ? 'curators' : 'public',
        contributors_text: (contributorsText||'').trim(),
        headerImage,
        gallery,
      }
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if(!res.ok){
        const t = await res.text()
        throw new Error(t)
      }
      setMsg('Готово! Проверь Discord.')
    }catch(e){
      setMsg('Ошибка: ' + e.message)
    }
  }

  return (
    <div style={{maxWidth: '1100px', margin: '0 auto', padding: 16}}>
      <h1 style={{margin:'8px 0'}}>Weazel News — Article Kit V6 (Watermark)</h1>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
        <section style={{background:'#fff', padding:12, border:'1px solid #ddd', borderRadius:12}}>
          <input placeholder='Заголовок' value={title} onChange={e=>setTitle(e.target.value)} style={{width:'100%',padding:10,marginBottom:8}}/>
          <input placeholder='Подзаголовок' value={subtitle} onChange={e=>setSubtitle(e.target.value)} style={{width:'100%',padding:10,marginBottom:8}}/>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <input placeholder='Автор' value={author} onChange={e=>setAuthor(e.target.value)} style={{padding:10}}/>
            <input placeholder='Теги через запятую' value={tags} onChange={e=>setTags(e.target.value)} style={{padding:10}}/>
          </div>
          <input placeholder='Подпись бренда (влияет на водяной знак)' value={brand} onChange={e=>setBrand(e.target.value)} style={{width:'100%',padding:10,marginTop:8,marginBottom:8}}/>
          <div style={{marginBottom:8}}>
            <label style={{fontSize:12,opacity:.8}}>Подписанты (каждый с новой строки, формат: Имя — Роль)</label>
            <textarea value={contributorsText} onChange={e=>setContributorsText(e.target.value)} style={{width:'100%',minHeight:80,padding:10}} placeholder="Л. Ясная — репортаж\nИ. Петров — фото" />
          </div>

          <div style={{background:'#fafafa', padding:10, border:'1px dashed #ccc', borderRadius:8, marginBottom:8}}>
            <div style={{fontWeight:600, marginBottom:6}}>Обложка</div>
            <input type="file" accept="image/*" onChange={pickHeader} />
            {headerImage && <div style={{marginTop:8}}><img src={headerImage.dataUrl} alt="header" style={{maxWidth:'100%', borderRadius:8, maxHeight:240, objectFit:'cover'}}/></div>}
          </div>

          <div style={{background:'#fafafa', padding:10, border:'1px dashed #ccc', borderRadius:8, marginBottom:8}}>
            <div style={{fontWeight:600, marginBottom:6}}>Галерея</div>
            <input type="file" accept="image/*" multiple onChange={pickGallery} />
            {gallery?.length>0 && (
              <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6, marginTop:8}}>
                {gallery.map((g,i)=>(<img key={i} src={g.dataUrl} alt={g.name} style={{width:'100%', height:90, objectFit:'cover', borderRadius:6}}/>))}
              </div>
            )}
          </div>

          <div>
            <div style={{fontWeight:600, marginBottom:6}}>Текст (Markdown)</div>
            <textarea value={markdown} onChange={e=>setMarkdown(e.target.value)} style={{width:'100%', minHeight:220, padding:10}}/>
          </div>

          <div style={{marginTop:12, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
            <label>
              <input type="checkbox" checked={toCurators} onChange={e=>setToCurators(e.target.checked)} />
              {' '}Отправить кураторам (выключи — сразу в общий канал)
            </label>
            <label>
              <input type="checkbox" checked={autoWatermark} onChange={e=>setAutoWatermark(e.target.checked)} />
              {' '}Водяной знак Weazel News
            </label>
          </div>

          <button onClick={send} style={{marginTop:10, background:'#000', color:'#fff', padding:'10px 16px', borderRadius:10, border:'none', cursor:'pointer'}}>Отправить</button>
          {msg && <div style={{marginTop:8, fontSize:14}}>{msg}</div>}
        </section>

        <section style={{background:'#fff', padding:12, border:'1px solid #ddd', borderRadius:12}}>
          <div style={{background:'#000',color:'#fff',padding:'8px 10px', borderRadius:8, fontWeight:700}}>WEAZEL NEWS</div>
          {headerImage && <div style={{height:220, overflow:'hidden', borderRadius:8, marginTop:8}}><img src={headerImage.dataUrl} style={{width:'100%', height:'100%', objectFit:'cover'}}/></div>}
          <h2 style={{margin:'8px 0 4px 0'}}>{title || 'Заголовок статьи'}</h2>
          {subtitle && <div style={{opacity:.7, marginBottom:4}}>{subtitle}</div>}
          <div style={{fontSize:12, opacity:.7}}>Автор: {author || '—'} • {new Date().toLocaleString()}</div>
          {contributorsText?.trim() && (
            <div style={{fontSize:12, marginTop:6}}>
              <div style={{fontWeight:600}}>Авторство:</div>
              <pre style={{whiteSpace:'pre-wrap', margin:0}}>{contributorsText}</pre>
            </div>
          )}
          {tags && <div style={{fontSize:12, opacity:.8, marginTop:6}}>{fmtTags()}</div>}
          <div style={{marginTop:8}} dangerouslySetInnerHTML={{__html: html || '<p><em>Здесь будет превью текста…</em></p>'}}/>
          {gallery?.length>0 && (
            <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6, marginTop:10}}>
              {gallery.map((g,i)=>(<img key={i} src={g.dataUrl} style={{width:'100%', borderRadius:6}}/>))}
            </div>
          )}
          <div style={{marginTop:10, fontSize:12, opacity:.7, borderTop:'1px solid #eee', paddingTop:6}}>{brand}</div>
        </section>
      </div>
    </div>
  )
}
