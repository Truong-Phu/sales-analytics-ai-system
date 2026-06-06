import requests, json
CID = '89ab1a10-64d2-49f3-9b28-811274d4ca37'
r = requests.get('http://localhost:8001/recommendation', params={'company_id': CID}, timeout=30)
print('Status:', r.status_code)
if r.status_code == 200:
    d = r.json()
    print(f"Total: {d['total']}")
    for rec in d['recommendations']:
        cat = rec['category']
        pri = rec['priority']
        title = rec['title']
        action = rec['action'][:80]
        print(f"[{pri}][{cat}] {title}")
        print(f"   -> {action}")
        print()
else:
    print('Error:', r.text[:300])
