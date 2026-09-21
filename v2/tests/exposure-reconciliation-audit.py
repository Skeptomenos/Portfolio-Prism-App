"""Offline Decimal reconciliation of a frozen private saved-data fixture.

Usage: python3 tests/exposure-reconciliation-audit.py PRIVATE_DIR NEW_OUTPUT.json
Requires overview.json, exposure.json, data.json and an online-backup portfolio.sqlite.
Reads SQLite immutable/read-only; never connects to providers or modifies the fixture.
Source allocation references are not cash valuations, NAV or economic reconciliation.
"""
import base64
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path
import sqlite3
import sys


def load(path):
    return json.loads(path.read_text(), parse_float=Decimal)


def number(value):
    return Decimal(str(value))


def source_rows(payload, date):
    if 'aaData' in payload:
        return [dict(name=r[1], isin=r[8], assetClass=r[3], equity=r[3] == 'Aktien',
                     weight=number(r[5]['raw'] if isinstance(r[5], dict) else r[5]))
                for r in payload['aaData']]
    points = payload['componentsByNameMap']['holdings']['containersByNameMap']['all']['dataPointsByNameMap']
    assert str(points['asOfDate']['value']) == date.replace('-', '')
    columns = [points[key]['value'] for key in ('issueName', 'isin', 'assetClass', 'holdingPercent')]
    assert len({len(column) for column in columns}) == 1, 'Unaligned source columns'
    return [dict(name=name, isin=isin, assetClass=kind, equity=kind == 'Equity', weight=number(weight))
            for name, isin, kind, weight in zip(*columns)]


def audit(folder):
    overview, exposure, data = [load(folder / (name + '.json')) for name in ('overview', 'exposure', 'data')]
    db = sqlite3.connect((folder / 'portfolio.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True)
    snapshot = json.loads(db.execute('SELECT payload FROM snapshots ORDER BY id DESC LIMIT 1').fetchone()[0])
    assert snapshot['fetchedAt'] == overview['holdingsAt'] == exposure['holdingsAt']
    sources = {key: json.loads(body, parse_float=Decimal) for key, body in db.execute('SELECT id,payload FROM data_sources')}
    for key in ('quotes', 'instrumentDetails'):
        assert next(s for s in data['sources'] if s['id'] == key) == sources[key], 'Frozen API/database source mismatch'
    quotes = {q['isin']: q for q in sources['quotes']['payload']}
    instruments = {i['isin']: i.get('response', {}) for i in sources['instrumentDetails']['payload']}
    positions = {(p['account'], p['isin']): p for p in snapshot['positions']}
    valued = {(p['account'], p['isin']): p for p in overview['rows']}
    assert positions.keys() == valued.keys()
    priced, unvalued = [], []
    for key, p in positions.items():
        row = valued[key]
        assert p['quantity'] == row['quantity']
        q, instrument = quotes.get(p['isin'], {}), instruments.get(p['isin'], {})
        if row['value'] is None:
            listings = [{k: listing.get(k) for k in ('slug', 'active', 'currencyId')}
                        for listing in instrument.get('listings', [])]
            unsupported = p['instrumentType'].lower() not in ('stock', 'fund', 'etf')
            active_venue = any(l['slug'] == q.get('venue') and l['active'] for l in listings)
            assert unsupported or not active_venue or not q.get('quote', {}).get('bid'), 'Unexplained unvalued position'
            remedy = ('Establish supported crypto pricing convention, unit and venue/currency basis.'
                      if p['instrumentType'].lower() == 'crypto' else
                      'Obtain an active compatible listing/currency and usable bid; retain corporate-action review.')
            unvalued.append(dict(isin=p['isin'], name=p['name'], reason=row['quality'], nextInput=remedy,
                                 instrumentType=p['instrumentType'], quoteError=q.get('error'),
                                 candidateVenue=q.get('venue'), listings=listings, savedBid=q.get('quote', {}).get('bid'),
                                 hasBid=isinstance(q.get('quote', {}).get('bid', {}).get('price'), str)))
            continue
        assert instrument['isin'] == p['isin'] and str(instrument['priceFactor']) == '1'
        listing = next(l for l in instrument['listings'] if l['slug'] == q['venue'] and l['active'])
        assert listing['currencyId'] == row['currency']
        bid = q['quote']['bid']
        quote_at = datetime.fromtimestamp(bid['time'] / 1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        assert quote_at == row['quoteAt'] and number(bid['price']) == number(row['price'])
        assert row['quantityObservedAt'] <= quote_at
        expected = number(p['quantity']) * number(bid['price'])
        assert expected == number(row['value'])
        priced.append(dict(isin=p['isin'], name=p['name'], quantity=p['quantity'], bid=bid['price'],
                           value=expected, currency=row['currency'], quoteAt=quote_at))

    selected, fund_reports = {}, []
    expected_contributions = Counter()
    for p in valued.values():
        if p['instrumentType'].lower() == 'stock' and number(p['quantity']) > 0:
            expected_contributions[('direct', p['account'], p['isin'], p['isin'])] += 1
    for composition in exposure['compositions']:
        fund, digest, date = (composition[k] for k in ('fundIsin', 'sha256', 'asOf'))
        stored = db.execute('SELECT evidence FROM provider_compositions WHERE fund_isin=? AND sha256=? AND as_of=?',
                            (fund, digest, date)).fetchone()
        assert stored, ('Missing selected original', fund, digest)
        evidence = json.loads(stored[0])
        artifact = next(a for a in evidence['artifacts'] if a['role'] == 'holdings')
        body = base64.b64decode(artifact['body'], validate=True)
        assert hashlib.sha256(body).hexdigest() == artifact['sha256'] == digest
        raw = source_rows(json.loads(body, parse_float=Decimal, parse_int=Decimal), date)
        equities = [r for r in raw if r['equity']]
        weights = {r['isin']: r['weight'] for r in equities}
        assert len(weights) == len(equities), 'Duplicate equity identifiers'
        assert Counter((r['isin'], number(r['weightPercent'])) for r in composition['rows']) == Counter(weights.items()), 'Unused or changed source equity rows'
        selected[fund] = weights
        held = [p for p in valued.values() if p['isin'] == fund and number(p['quantity']) > 0]
        for p in held:
            for isin in weights:
                expected_contributions[('etf', p['account'], fund, isin)] += 1
        total = sum((r['weight'] for r in raw), Decimal(0))
        equity = sum(weights.values(), Decimal(0))
        non_equity = [r for r in raw if not r['equity']]
        classes = defaultdict(Decimal)
        for r in non_equity:
            classes[r['assetClass']] += r['weight']
        refs = [dict(account=p['account'], currency=p['currency'], fundValue=p['value'],
                     nonEquityAssetClassAllocationReferences={kind: None if p['value'] is None else number(p['value']) * weight / 100
                                                              for kind, weight in classes.items()},
                     sourceDifferenceAllocationReference=None if p['value'] is None else number(p['value']) * (100-total) / 100,
                     allocationRemainderReference=None if p['value'] is None else number(p['value']) * (100 - equity) / 100)
                for p in held]
        fund_reports.append(dict(fundIsin=fund, asOf=date, sha256=digest, sourceRows=len(raw), equityRows=len(equities),
                                 equityPercent=equity, nonEquityRows=non_equity, nonEquityAssetClassPercent=dict(classes),
                                 reportedTotalPercent=total, differenceFrom100Percent=100-total,
                                 differenceMeaning='Reported precision/rounding or unexplained source difference; not an economic cash amount.',
                                 remainderPercent=100-equity, allocationReferences=refs))
    db.close()
    actual_contributions, checked = Counter(), 0
    for row in exposure['rows']:
        total = Decimal(0)
        for c in row['contributions']:
            actual_contributions[(c['kind'], c['account'], c['positionIsin'], row['isin'])] += 1
            position = valued[(c['account'], c['positionIsin'])]
            assert c['positionValue'] == position['value']
            weight = selected[c['positionIsin']][row['isin']] if c['kind'] == 'etf' else Decimal(100)
            assert weight == number(c['weightPercent'])
            if position['value'] is None:
                assert c['value'] is None
            else:
                expected = number(position['value']) * weight / 100
                assert expected == number(c['value'])
                total += expected
                checked += 1
        assert total == number(row['knownTotal'])
    assert actual_contributions == expected_contributions, 'Missing or duplicate contribution lines'
    direct = []
    for p in valued.values():
        if p['instrumentType'].lower() != 'stock':
            continue
        matches = [dict(fundIsin=fund, weightPercent=weights[p['isin']]) for fund, weights in selected.items() if p['isin'] in weights]
        reported = next(r for r in exposure['directStockCoverage'] if (r['account'], r['isin']) == (p['account'], p['isin']))
        assert {r['fundIsin'] for r in matches} == {r['fundIsin'] for r in reported['matchedFunds']}
        direct.append(dict(isin=p['isin'], name=p['name'], value=p['value'], matches=matches))
    for coverage in exposure['coverage']:
        known = sum((number(r['knownTotal']) for r in exposure['rows'] if r['currency'] == coverage['currency']), Decimal(0))
        priced_total = sum((number(r['value']) for r in priced if r['currency'] == coverage['currency']), Decimal(0))
        assert known == number(coverage['knownCompanyValue'])
        assert known + number(coverage['unresolvedValue']) == priced_total == number(coverage['pricedSecurities'])
    heico = sum((number(r['knownTotal']) for r in exposure['rows'] if r['isin'] in ('US4228061093', 'US4228062083') and r['currency'] == 'EUR'), Decimal(0))
    return dict(status='passed', holdingsAt=overview['holdingsAt'], inputHashes={name: hashlib.sha256((folder/name).read_bytes()).hexdigest()
                for name in ('overview.json', 'exposure.json', 'data.json')}, pricedPositions=priced, unvaluedPositions=unvalued,
                positionValuesVerified=len(priced), sourcePublicationsVerified=len(selected), funds=fund_reports,
                directStocks=direct, matchedDirectStocks=sum(bool(r['matches']) for r in direct),
                unmatchedDirectStocks=sum(not r['matches'] for r in direct), valuedContributionsVerified=checked,
                allContributionLinesVerified=sum(actual_contributions.values()), unusedEquityRows=0,
                coverage=exposure['coverage'], conservation='passed', heicoCombinedEUR=heico,
                limits='Saved quantity times admitted bid and issuer allocation arithmetic only. No broker-app reconciliation, cash valuation, NAV, hedge/swap economics or broader company-identity completion.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    folder, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
    if output.exists():
        raise SystemExit('Output already exists; choose a new output path.')
    with localcontext() as context:
        context.prec = 256
        result = audit(folder)
    with output.open('x') as handle:
        json.dump(result, handle, indent=2, default=lambda value: format(value, 'f'))
        handle.write('\n')
    print(json.dumps({key: result[key] for key in ('status', 'positionValuesVerified', 'sourcePublicationsVerified',
          'matchedDirectStocks', 'unmatchedDirectStocks', 'valuedContributionsVerified', 'unusedEquityRows', 'heicoCombinedEUR')}, default=str))
