export default async function handler(req, res){
  try{
    if(req.method !== 'POST') return res.status(405).send('Method Not Allowed')
    const {
      title='', subtitle='', author='', tags='', brand='Weazel News',
      markdown='', excerpt='', to='curators',
      headerImage=null, gallery=[], contributors_text=''
    } = req.body || {}

    const webhook = to === 'public'
      ? process.env.DISCORD_WEBHOOK_PUBLIC
      : (process.env.DISCORD_WEBHOOK_CURATORS || process.env.DISCORD_WEBHOOK_PUBLIC)

    if(!webhook) return res.status(500).send('Webhook is not configured')

    // Convert dataURL -> {filename, buffer, contentType}
    function parseDataUrl(name, dataUrl){
      if(!dataUrl) return null
      const m = dataUrl.match(/^data:(.*?);base64,(.*)$/)
      if(!m) return null
      const contentType = m[1] || 'application/octet-stream'
      const buffer = Buffer.from(m[2], 'base64')
      const filename = name || ('file_' + Date.now())
      return { filename, buffer, contentType }
    }

    const files = []
    const header = headerImage?.dataUrl ? parseDataUrl(headerImage.name || 'header.jpg', headerImage.dataUrl) : null
    if(header) files.push(header)
    for(const g of (gallery||[])){
      const f = parseDataUrl(g.name || 'image.jpg', g.dataUrl)
      if(f) files.push(f)
    }

    const embeds = [{
      title: title || 'Новая статья',
      description: [subtitle, excerpt || (markdown ? markdown.slice(0,180) + '…' : '')].filter(Boolean).join('\n\n'),
      color: 0x111111,
      author: author ? { name: author } : undefined,
      footer: { text: brand },
      image: files[0] ? { url: `attachment://${files[0].filename}` } : undefined,
      fields: [
        ...(tags ? [{ name: 'Теги', value: tags }] : []),
        ...(contributors_text ? [{ name: 'Авторство', value: contributors_text }] : []),
      ]
    }]

    // Use undici's FormData/Blob (available in Node 18+) or fallback to form-data pkg
    let form
    let useNodeFormData = false
    try {
      // try native FormData
      form = new FormData()
    } catch(e){
      useNodeFormData = true
    }

    if(useNodeFormData){
      const FormData = (await import('form-data')).default
      form = new FormData()
      form.append('payload_json', JSON.stringify({ username: to==='public' ? 'Weazel News Bot' : 'Weazel Curator', embeds }))
      // form-data needs streams/buffers
      for(let i=0;i<files.length;i++){
        const f = files[i]
        form.append(`files[${i}]`, f.buffer, { filename: f.filename, contentType: f.contentType })
      }
      const resp = await fetch(webhook, { method: 'POST', body: form })
      const text = await resp.text()
      if(!resp.ok) return res.status(resp.status).send(text || 'Discord error')
      return res.status(200).json({ ok:true })
    } else {
      // native FormData & Blob available
      form.append('payload_json', JSON.stringify({ username: to==='public' ? 'Weazel News Bot' : 'Weazel Curator', embeds }))
      for(let i=0;i<files.length;i++){
        const f = files[i]
        form.append(`files[${i}]`, new Blob([f.buffer], { type: f.contentType }), f.filename)
      }
      const resp = await fetch(webhook, { method: 'POST', body: form })
      const text = await resp.text()
      if(!resp.ok) return res.status(resp.status).send(text || 'Discord error')
      return res.status(200).json({ ok:true })
    }
  }catch(e){
    return res.status(500).send('Server error: ' + e.message)
  }
}
