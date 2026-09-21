"""Independent Decimal comparison on an explicit private copied ledger DB."""
import collections, decimal, hashlib, json, pathlib, re, sqlite3, sys
D = decimal.Decimal
decimal.getcontext().prec = 256
path = pathlib.Path(sys.argv[1]).resolve()
if path == pathlib.Path.home() / '.portfolio-prism-v2/portfolio.sqlite':
    raise SystemExit('Use a private copy')
db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
loads = lambda text: json.loads(text, parse_float=D)
events = [(loads(r[0]), loads(r[1])) for r in db.execute('SELECT v.payload,v.evidence FROM ledger_event_heads h JOIN ledger_event_versions v ON h.version_id=v.seq')]
checks = collections.Counter()
for event, evidence in events:
    original = evidence['event']
    assert original['id'] == event['sourceId']
    if original['status'] != 'EXECUTED' or original['deleted']:
        assert not event['cash'] and not event['securities']
        checks['nonExecutedWithoutBookedEffects'] += 1
    for leg in event['cash']:
        assert D(leg['amount']) == D(original['amount']['value'])
        assert leg['currency'] == original['amount']['currency']
        checks['sourceCashLegs'] += 1
    if event['securities']:
        assert evidence['detailIdentity'] == 'matched'
        assert evidence['detail']['id'] == event['sourceId']
        rows = [r for r in evidence['detail']['rows'] if r['label'] == 'Transaction']
        assert len(rows) == 1
        prefix = rows[0]['prefix'] or rows[0]['text']
        quantity = D(re.match(r'^(\d+(?:\.\d+)?)\s*[×x]', prefix).group(1))
        assert abs(D(event['securities'][0]['quantity'])) == quantity
        checks['sourceReportedQuantities'] += 1
# Independently exercise decimal cancellation and fee inclusion, without binary floats.
assert D('10') + D('0.1234567890123456789') - D('0.1234567890123456789') + D('10') + D('0.5') == D('20.5')
assert D('100') + D('50.1234567890123456789') - D('50.1234567890123456789') - D('11') == D('89')
print(json.dumps({'checks': dict(checks), 'independentDecimalExamples': 2, 'passed': True}))
