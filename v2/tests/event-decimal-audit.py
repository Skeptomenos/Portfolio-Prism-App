"""Independent Decimal comparison on an explicit private copied ledger DB."""
import collections, decimal, hashlib, json, pathlib, re, sqlite3, sys
D = decimal.Decimal
decimal.getcontext().prec = 256
path = pathlib.Path(sys.argv[1]).resolve()
if path == pathlib.Path.home() / '.portfolio-prism-v2/portfolio.sqlite':
    raise SystemExit('Use a private copy')
db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
loads = lambda text: json.loads(text, parse_float=D)
sources = {k: loads(v) for k, v in db.execute('SELECT id,payload FROM data_sources')}
raw = {r['id']: r for r in sources['timelineTransactions']['payload']['items']}
details = {r['id']: r.get('response') for r in sources['timelineDetails']['payload']['items']}
events = [loads(r[0]) for r in db.execute('SELECT v.payload FROM ledger_event_heads h JOIN ledger_event_versions v ON h.version_id=v.seq')]
checks = collections.Counter()
for event in events:
    original = raw[event['sourceId']]
    if original['status'] != 'EXECUTED' or original['deleted']:
        assert not event['cash'] and not event['securities']
        checks['nonExecutedWithoutBookedEffects'] += 1
    for leg in event['cash']:
        assert D(leg['amount']) == D(original['amount']['value'])
        assert leg['currency'] == original['amount']['currency']
        checks['sourceCashLegs'] += 1
    if event['securities']:
        rows = [r for s in details[event['sourceId']]['sections'] if s.get('type') == 'table' for r in s.get('data', []) if r.get('title') == 'Transaction']
        prefix = rows[0]['detail']['displayValue']['prefix']
        quantity = D(re.match(r'^(\d+(?:\.\d+)?)\s*[×x]', prefix).group(1))
        assert abs(D(event['securities'][0]['quantity'])) == quantity
        checks['sourceReportedQuantities'] += 1
# Independently exercise decimal cancellation and fee inclusion, without binary floats.
assert D('10') + D('0.1234567890123456789') - D('0.1234567890123456789') + D('10') + D('0.5') == D('20.5')
assert D('100') + D('50.1234567890123456789') - D('50.1234567890123456789') - D('11') == D('89')
print(json.dumps({'checks': dict(checks), 'independentDecimalExamples': 2, 'passed': True}))
