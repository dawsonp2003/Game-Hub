const res = await fetch('http://localhost:3001/api/tier-items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Pokemon', max: 10 }),
})
console.log('status:', res.status)
const data = await res.json()
console.log(JSON.stringify(data, null, 2).slice(0, 1200))
