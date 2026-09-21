"""Independent Python Decimal audit of a private provider-live-replay report.
Usage: python3 tests/provider-decimal-audit.py REPORT COPIED_DB NEW_AUDIT
Run after the replay utility closes its private copy. No broker connection, source requests or writes to the database.
"""
import base64
import hashlib
import json
import sqlite3
import sys
from decimal import Decimal, localcontext
from pathlib import Path

report_path, database_path, output_path = map(Path, sys.argv[1:])
report = json.loads(report_path.read_text(), parse_float=Decimal)
connection = sqlite3.connect(f'file:{database_path}?mode=ro&immutable=1', uri=True)
raw_weights = {}
for fund, digest, date, raw in connection.execute('SELECT fund_isin,sha256,as_of,evidence FROM provider_compositions'):
    evidence = json.loads(raw)
    artifact = next(a for a in evidence['artifacts'] if a['role'] == 'holdings')
    body = base64.b64decode(artifact['body'], validate=True)
    assert hashlib.sha256(body).hexdigest() == digest == artifact['sha256']
    payload = json.loads(body, parse_float=Decimal, parse_int=Decimal)
    if 'aaData' in payload:
        rows = payload['aaData']
        weights = {row[8]: Decimal(str(row[5]['raw'] if isinstance(row[5], dict) else row[5])) for row in rows if row[3] == 'Aktien'}
    else:
        points = payload['componentsByNameMap']['holdings']['containersByNameMap']['all']['dataPointsByNameMap']
        assert str(points['asOfDate']['value']) == date.replace('-', '')
        assert len(points['isin']['value']) == len(points['holdingPercent']['value']) == len(points['assetClass']['value'])
        weights = {isin: Decimal(str(weight)) for isin, weight, kind in zip(points['isin']['value'], points['holdingPercent']['value'], points['assetClass']['value']) if kind == 'Equity'}
    raw_weights[(fund, digest)] = weights
connection.close()
checks = 0
with localcontext() as context:
    context.prec = 256
    for row in report['after']['rows']:
        total = Decimal(0)
        for contribution in row['contributions']:
            if contribution['kind'] == 'etf':
                source = contribution['source']
                original = raw_weights.get((source['fundIsin'], source['sha256']))
                assert original is not None, ('Missing original provider evidence', source['fundIsin'], source['sha256'])
                assert Decimal(contribution['weightPercent']) == original[row['isin']]
            if contribution['positionValue'] is None:
                assert contribution['value'] is None
                continue
            expected = Decimal(contribution['positionValue']) * Decimal(contribution['weightPercent']) / Decimal(100)
            assert expected == Decimal(contribution['value']), (row['isin'], expected, contribution['value'])
            total += expected
            checks += 1
        assert total == Decimal(row['knownTotal'])
    for coverage in report['after']['coverage']:
        known = sum((Decimal(row['knownTotal']) for row in report['after']['rows'] if row['currency'] == coverage['currency']), Decimal(0))
        assert known == Decimal(coverage['knownCompanyValue'])
        assert known + Decimal(coverage['unresolvedValue']) == Decimal(coverage['pricedSecurities'])
    def security(view, isin):
        return next((row['knownTotal'] for row in view['rows'] if row['isin'] == isin and row['currency'] == 'EUR'), None)
    result = {'contributionsVerified': checks, 'sourcePublicationsVerifiedFromOriginalBytes': len(raw_weights), 'restartEqual': report['restartEqual'], 'beforeCoverage': report['before']['coverage'], 'afterCoverage': report['after']['coverage'], 'nvidiaEUR': {'before': security(report['before'], 'US67066G1040'), 'after': security(report['after'], 'US67066G1040')}}
with output_path.open('x') as output:
    json.dump(result, output, indent=2)
print(json.dumps(result, indent=2))
