#!/usr/bin/env python3
"""dms-samples.py - generate the six synthetic DMS sample documents + manifest.json.

    python3 -m venv /tmp/dmsvenv && /tmp/dmsvenv/bin/pip install reportlab
    /tmp/dmsvenv/bin/python3 -I scripts/dms-samples.py

Writes content/dms/samples/*.pdf and content/dms/samples/manifest.json
([{file, kind, title, dealNo?, expected:{...}}]). All people, companies, ABNs,
registrations and VINs are fictional. Deterministic: re-running gives the same files.
"""
import json
import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'content', 'dms', 'samples')
W, H = A4
INK = colors.HexColor('#1b1f2a')
GREY = colors.HexColor('#5b6270')
RULE = colors.HexColor('#c9ced8')
FILL = colors.HexColor('#eef1f5')
ACCENT = colors.HexColor('#0b5cad')
PEN = colors.HexColor('#1a2f8a')


def money(n, cents=False):
    s = f"{abs(n):,.2f}" if cents else f"{abs(round(n)):,}"
    return ('-$' if n < 0 else '$') + s


def abn_valid(abn):
    d = [int(c) for c in abn.replace(' ', '')]
    d[0] -= 1
    w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    return sum(a * b for a, b in zip(d, w)) % 89 == 0


def make_abn(prefix):
    """Smallest checksum-valid ABN starting with the 8-digit prefix (fictional)."""
    for tail in range(1000):
        s = f"{prefix}{tail:03d}"
        if abn_valid(s):
            return f"{s[:2]} {s[2:5]} {s[5:8]} {s[8:]}"
    raise ValueError(prefix)


# ── drawing helpers ─────────────────────────────────────────────────────────
class Doc:
    def __init__(self, path, title):
        self.c = canvas.Canvas(path, pagesize=A4, invariant=1)
        self.c.setTitle(title)
        self.c.setAuthor('Harbourline DMS sample generator (synthetic)')
        self.c.setSubject('Synthetic demo document - fictional data')
        self.y = H - 18 * mm

    def text(self, x, y, s, size=9, font='Helvetica', color=INK):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawString(x, y, s)

    def rtext(self, x, y, s, size=9, font='Helvetica', color=INK):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawRightString(x, y, s)

    def header(self, org, lines, doc_title, ref_pairs, band=INK):
        c = self.c
        c.setFillColor(band)
        c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
        self.text(15 * mm, H - 13 * mm, org, 16, 'Helvetica-Bold', colors.white)
        for i, l in enumerate(lines):
            self.text(15 * mm, H - 19 * mm - i * 4 * mm, l, 7.5, 'Helvetica', colors.HexColor('#d5d9e2'))
        self.rtext(W - 15 * mm, H - 13 * mm, doc_title, 13, 'Helvetica-Bold', colors.white)
        for i, (k, v) in enumerate(ref_pairs):
            self.rtext(W - 15 * mm, H - 19 * mm - i * 4 * mm, f"{k}: {v}", 8, 'Helvetica', colors.white)
        self.y = H - 38 * mm

    def section(self, title):
        c = self.c
        c.setFillColor(FILL)
        c.rect(15 * mm, self.y - 1.5 * mm, W - 30 * mm, 6 * mm, stroke=0, fill=1)
        self.text(17 * mm, self.y, title.upper(), 8, 'Helvetica-Bold', ACCENT)
        self.y -= 7 * mm

    def boxes(self, fields, cols=2, h=9.5 * mm):
        """Labelled form boxes: fields = [(label, value)]."""
        c = self.c
        x0, tw = 15 * mm, W - 30 * mm
        cw = tw / cols
        for i, (label, value) in enumerate(fields):
            col = i % cols
            if col == 0 and i:
                self.y -= h
            x = x0 + col * cw
            c.setStrokeColor(RULE)
            c.setLineWidth(0.6)
            c.rect(x, self.y - h + 3 * mm, cw, h, stroke=1, fill=0)
            self.text(x + 1.8 * mm, self.y + 3 * mm - 3.2 * mm, label, 6.5, 'Helvetica', GREY)
            self.text(x + 1.8 * mm, self.y - h + 4.6 * mm, str(value), 9.5, 'Helvetica-Bold')
        self.y -= h + 2.5 * mm

    def table(self, headers, rows, widths, aligns=None, total_rows=()):
        c = self.c
        x0 = 15 * mm
        aligns = aligns or ['l'] * len(headers)
        rh = 5.8 * mm
        c.setFillColor(INK)
        c.rect(x0, self.y - 2 * mm, sum(widths), rh, stroke=0, fill=1)
        x = x0
        for hd, w, a in zip(headers, widths, aligns):
            if a == 'r':
                self.rtext(x + w - 2 * mm, self.y, hd, 7.5, 'Helvetica-Bold', colors.white)
            else:
                self.text(x + 2 * mm, self.y, hd, 7.5, 'Helvetica-Bold', colors.white)
            x += w
        self.y -= rh
        for ri, row in enumerate(list(rows) + list(total_rows)):
            is_total = ri >= len(rows)
            if not is_total and ri % 2 == 1:
                c.setFillColor(colors.HexColor('#f7f8fa'))
                c.rect(x0, self.y - 2 * mm, sum(widths), rh, stroke=0, fill=1)
            c.setStrokeColor(RULE)
            c.setLineWidth(0.4)
            c.line(x0, self.y - 2 * mm, x0 + sum(widths), self.y - 2 * mm)
            x = x0
            for cell, w, a in zip(row, widths, aligns):
                font = 'Helvetica-Bold' if is_total else 'Helvetica'
                if a == 'r':
                    self.rtext(x + w - 2 * mm, self.y, str(cell), 8.5, font)
                else:
                    self.text(x + 2 * mm, self.y, str(cell), 8.5, font)
                x += w
            self.y -= rh
        self.y -= 3 * mm

    def para(self, lines, size=7.5, color=GREY, lead=3.6 * mm):
        for l in lines:
            self.text(15 * mm, self.y, l, size, 'Helvetica', color)
            self.y -= lead
        self.y -= 2 * mm

    def signature(self, x, y, w, name, role, date, seed=1, signed=True):
        c = self.c
        c.setStrokeColor(INK)
        c.setLineWidth(0.6)
        c.line(x, y, x + w, y)
        if signed:
            c.setStrokeColor(PEN)
            c.setLineWidth(1.1)
            p = c.beginPath()
            sx, sy = x + 6 * mm, y + 3 * mm
            p.moveTo(sx, sy)
            k = 1 + (seed % 3) * 0.25
            pts = [(5, 9, 8, -4, 12, 5), (15, 12, 18, -3, 22, 4), (25, 10, 27, 0, 31, 6),
                   (34, 11, 36, -2, 40 * k, 3), (43, 7, 46, 1, 50, 4)]
            for a, b, cc, d, e, f in pts:
                p.curveTo(sx + a * mm * 0.8, sy + b * mm * 0.5, sx + cc * mm * 0.8, sy + d * mm * 0.5, sx + e * mm * 0.8, sy + f * mm * 0.5)
            c.drawPath(p, stroke=1, fill=0)
            c.line(sx - 2 * mm, sy - 1.5 * mm, sx + 30 * mm, sy - 0.5 * mm)
            # "signed" marker so OCR/extraction can see the signature line is executed
            c.setStrokeColor(colors.HexColor('#1f7a3a'))
            c.setFillColor(colors.HexColor('#1f7a3a'))
            c.roundRect(x + w - 19 * mm, y + 2 * mm, 18 * mm, 5.5 * mm, 1.2 * mm, stroke=1, fill=0)
            self.text(x + w - 16.8 * mm, y + 3.7 * mm, 'SIGNED', 8, 'Helvetica-Bold', colors.HexColor('#1f7a3a'))
        self.text(x, y - 4 * mm, f"{role}: {name}", 8, 'Helvetica-Bold')
        self.text(x, y - 8 * mm, f"Signed: {'yes' if signed else 'no'}   Date: {date}", 7.5, 'Helvetica', GREY)

    def footer(self, s, page='Page 1 of 1'):
        c = self.c
        c.setStrokeColor(RULE)
        c.line(15 * mm, 14 * mm, W - 15 * mm, 14 * mm)
        self.text(15 * mm, 10 * mm, s, 6.5, 'Helvetica', GREY)
        self.rtext(W - 15 * mm, 10 * mm, page, 6.5, 'Helvetica', GREY)

    def save(self):
        self.c.showPage()
        self.c.save()


DEALER = 'Harbourline Toyota'
DEALER_ABN = make_abn('71845209')
DEALER_LINES = {
    'par': ['Parramatta: 120 Church Street, Parramatta NSW 2150 - (02) 9630 4100',
            f'ABN {DEALER_ABN} - MD 23871 - Australian Credit Licence representative 512448'],
    'hor': ['Hornsby: 2 Pacific Highway, Hornsby NSW 2077 - (02) 9477 8200',
            f'ABN {DEALER_ABN} - MD 23871 - Australian Credit Licence representative 512448'],
}

# ── 1-2. contracts ──────────────────────────────────────────────────────────
CONTRACTS = [
    dict(file='contract-D-10482-raman.pdf', site='par', dealNo='D-10482', contractDate='2026-10-12',
         customer='Priya Raman', customerAddress='14 Bridge Road, Westmead NSW 2145', customerPhone='0412 555 018',
         customerEmail='priya.raman@example.com', licence='NSW xxxx4471',
         salesperson='Mia Thompson', vehicle='2026 Toyota RAV4 Cruiser Hybrid AWD', colour='Graphite', interior='Black leather-accented',
         vin='JTMW079192231B000', stockNo='HL-2231', odometer='12 km', condition='New, unregistered (in stock 94 days)',
         vehiclePrice=59240, onRoadCosts=3550,
         accessories=[('Protection Pack (fitted)', 890), ('Towing Pack', 1650)], promotions=[],
         readyNowBonus=1800, discount=0,
         tradeIn=dict(desc='2017 Mazda CX-5 Maxx Sport, rego EKP42L', allowance=14500, payout=0),
         deposit=1000, lender='Toyota Finance', termMonths=60, deliveryDate='2026-10-21',
         approval='SM Sam Nguyen (within headroom)', dealerSigner='Sam Nguyen'),
    dict(file='contract-D-10517-okafor.pdf', site='hor', dealNo='D-10517', contractDate='2026-10-13',
         customer='Daniel Okafor', customerAddress='7 Royston Parade, Asquith NSW 2077', customerPhone='0423 555 194',
         customerEmail='d.okafor@example.com', licence='NSW xxxx9082',
         salesperson='Ben Kowalski', vehicle='2026 Toyota Kluger Grande Hybrid AWD', colour='Graphite', interior='Black leather-accented',
         vin='5TDB633521941A000', stockNo='HL-1941', odometer='9 km', condition='New, unregistered (in stock 110 days)',
         vehiclePrice=88640, onRoadCosts=3950,
         accessories=[('Roof & Cargo Pack', 1290)],
         promotions=[('Complimentary 3-year Toyota Service Advantage (promo-tsa-aged)', 0)],
         readyNowBonus=2400, discount=500,
         tradeIn=dict(desc='2015 Ford Territory TS, rego CWR18H', allowance=9800, payout=0),
         deposit=2000, lender='Macquarie', termMonths=48, deliveryDate='2026-10-24',
         approval='GM Rachel Moore (concession $2,900)', dealerSigner='Rachel Moore'),
]


def build_contract(k):
    acc = sum(v for _, v in k['accessories'])
    drive = k['vehiclePrice'] + k['onRoadCosts'] + acc - k['readyNowBonus'] - k['discount']
    balance = drive - k['tradeIn']['allowance'] + k['tradeIn']['payout'] - k['deposit']
    k.update(accessoriesTotal=acc, driveAway=drive, amountFinanced=balance)
    d = Doc(os.path.join(OUT, k['file']), f"Contract of sale {k['dealNo']}")
    d.header(DEALER, DEALER_LINES[k['site']], 'NEW VEHICLE CONTRACT OF SALE',
             [('Deal no', k['dealNo']), ('Contract date', k['contractDate']), ('Stock no', k['stockNo'])])
    d.section('1. Purchaser')
    d.boxes([('Full name', k['customer']), ('Phone', k['customerPhone']), ('Residential address', k['customerAddress']),
             ('Email', k['customerEmail']), ('Driver licence (sighted)', k['licence']), ('Salesperson', k['salesperson'])])
    d.section('2. Vehicle')
    d.boxes([('Make / model / variant', k['vehicle']), ('Stock no', k['stockNo']), ('VIN', k['vin']),
             ('Colour / trim', f"{k['colour']} / {k['interior']}"), ('Odometer', k['odometer']), ('Condition', k['condition'])])
    d.section('3. Price')
    rows = [('Vehicle price (incl. GST)', money(k['vehiclePrice'])),
            ('On-road costs (registration, CTP, stamp duty, dealer delivery)', money(k['onRoadCosts']))]
    rows += [(f"Accessory: {n}", money(v)) for n, v in k['accessories']]
    rows += [(f"Promotion: {n}", 'Included' if v == 0 else money(-v)) for n, v in k['promotions']]
    rows += [('Ready-now bonus (aged stock)', money(-k['readyNowBonus']))]
    rows += [('Discount', money(-k['discount']))]
    d.table(['Item', 'Amount (AUD)'], rows, [130 * mm, 50 * mm], ['l', 'r'],
            total_rows=[('DRIVE-AWAY PRICE', money(drive))])
    d.section('4. Settlement')
    t = k['tradeIn']
    d.table(['Settlement', 'Amount (AUD)'],
            [(f"Trade-in allowance: {t['desc']}", money(-t['allowance'])),
             ('Payout owing on trade-in', money(t['payout'])),
             ('Deposit paid (received)', money(-k['deposit']))],
            [130 * mm, 50 * mm], ['l', 'r'],
            total_rows=[('BALANCE PAYABLE ON DELIVERY', money(balance))])
    d.boxes([('Method of payment', 'Finance'), ('Lender', k['lender']),
             ('Amount financed', money(balance)), ('Term', f"{k['termMonths']} months"),
             ('Agreed delivery date', k['deliveryDate']), ('Approval', k['approval'])])
    d.para(['The purchaser agrees to buy and the dealer agrees to sell the vehicle on these terms and the Harbourline Standard Terms of Sale (rev. 07/2026),',
            'which the purchaser acknowledges receiving. Finance is subject to lender approval; this contract is conditional on approval within 5 business days.',
            'The ready-now bonus applies because the vehicle has been in stock longer than 60 days; it is new, unregistered and carries the',
            'full new-vehicle warranty from delivery.',
            'Synthetic demonstration document. All names, addresses, numbers and the dealer are fictional.'])
    y = d.y - 10 * mm
    d.signature(15 * mm, y, 80 * mm, k['customer'], 'Purchaser', k['contractDate'], seed=1)
    d.signature(110 * mm, y, 80 * mm, k['dealerSigner'], 'For the dealer', k['contractDate'], seed=2)
    d.footer(f"Harbourline Toyota - Contract of sale {k['dealNo']} - Synthetic sample for the Harbourline DMS demo")
    d.save()
    return dict(file=k['file'], kind='contract', title=f"Signed contract of sale {k['dealNo']} - {k['customer']}", dealNo=k['dealNo'],
                expected=dict(dealNo=k['dealNo'], contractDate=k['contractDate'], customer=k['customer'], vin=k['vin'], stockNo=k['stockNo'],
                              vehicle=k['vehicle'], vehiclePrice=k['vehiclePrice'], onRoadCosts=k['onRoadCosts'],
                              accessories=[{'name': n, 'price': v} for n, v in k['accessories']], accessoriesTotal=acc,
                              promotions=[n for n, _ in k['promotions']],
                              readyNowBonus=k['readyNowBonus'], discount=k['discount'], driveAway=drive,
                              tradeIn=t['desc'], tradeInAllowance=t['allowance'], deposit=k['deposit'],
                              amountFinanced=balance, lender=k['lender'], termMonths=k['termMonths'],
                              deliveryDate=k['deliveryDate'], salesperson=k['salesperson'],
                              buyerSigned=True, dealerSigned=True))


# ── 3-4. trade-in appraisal forms ───────────────────────────────────────────
TRADES = [
    dict(file='trade-in-EKP42L-cx5.pdf', site='par', ref='TI-30418', dealNo='D-10482', date='2026-10-09',
         owner='Priya Raman', ownerAddress='14 Bridge Road, Westmead NSW 2145', rego='EKP42L', state='NSW', regoExpiry='2027-03-18',
         vin='JM0KF4W7A00381624', make='Mazda', model='CX-5 Maxx Sport', year=2017, km=98450, body='Wagon', transmission='Automatic',
         fuel='Petrol 2.5L', colour='Soul Red', keys=2, serviceHistory='Full logbook, last service 2026-08 at 96,900 km',
         tyres='FL 5 mm, FR 5 mm, RL 4 mm, RR 4 mm', ppsr='Clear (no security interest), certificate 4412-8870-1192',
         condition=['Light scratch on rear bumper, left corner', 'Stone chips on bonnet', 'Driver seat bolster wear',
                    'No warning lights; drives well; no accident history declared'],
         recon=[('Paint touch-up rear bumper', 380), ('Interior detail', 220), ('Service due', 400)],
         marketGuide=15600, valuation=14500, appraiser='Luke Harris'),
    dict(file='trade-in-CWR18H-territory.pdf', site='hor', ref='TI-30441', dealNo='D-10517', date='2026-10-11',
         owner='Daniel Okafor', ownerAddress='7 Royston Parade, Asquith NSW 2077', rego='CWR18H', state='NSW', regoExpiry='2027-01-05',
         vin='6FPAAAJGSWFA41277', make='Ford', model='Territory TS', year=2015, km=162300, body='Wagon', transmission='Automatic',
         fuel='Diesel 2.7L', colour='Silhouette Silver', keys=1, serviceHistory='Partial: 2015-2022 dealer, 2023-2026 independent',
         tyres='FL 3 mm, FR 3 mm, RL 4 mm, RR 4 mm', ppsr='Clear (no security interest), certificate 4412-9031-5507',
         condition=['Hail damage to roof and bonnet (approx. 40 dents, unrepaired)', 'Windscreen chip passenger side',
                    'Front tyres near replacement', 'One key only', 'Minor oil seep at sump; no warning lights'],
         recon=[('Paintless dent repair roof and bonnet', 2600), ('Front tyres (2)', 520), ('Windscreen repair', 120), ('Service and sump seal', 680)],
         marketGuide=13700, valuation=9800, appraiser='Grace Lin'),
]


def build_trade(t):
    d = Doc(os.path.join(OUT, t['file']), f"Trade-in appraisal {t['ref']}")
    d.header(DEALER, DEALER_LINES[t['site']], 'TRADE-IN APPRAISAL FORM',
             [('Appraisal no', t['ref']), ('Date', t['date']), ('Deal no', t['dealNo'])], band=colors.HexColor('#24324a'))
    d.section('A. Registered owner')
    d.boxes([('Owner name', t['owner']), ('Address', t['ownerAddress'])])
    d.section('B. Vehicle identification')
    d.boxes([('Registration', t['rego']), ('State / rego expiry', f"{t['state']} / {t['regoExpiry']}"),
             ('VIN (read from compliance plate)', t['vin']), ('Make', t['make']),
             ('Model / variant', t['model']), ('Year', t['year']),
             ('Odometer (km)', f"{t['km']:,}"), ('Body / transmission', f"{t['body']} / {t['transmission']}"),
             ('Fuel / engine', t['fuel']), ('Colour', t['colour']), ('Keys', t['keys']), ('PPSR', t['ppsr'])], cols=2)
    d.section('C. Condition')
    d.boxes([('Service history', t['serviceHistory']), ('Tyre tread depth', t['tyres'])])
    d.text(15 * mm, d.y + 1 * mm, 'Condition notes', 7, 'Helvetica', GREY)
    d.y -= 4 * mm
    for n in t['condition']:
        d.c.setStrokeColor(INK)
        d.c.rect(16 * mm, d.y - 0.6 * mm, 2.6 * mm, 2.6 * mm, stroke=1, fill=0)
        d.text(17 * mm - 0.4, d.y - 0.1 * mm, 'x', 7, 'Helvetica-Bold')
        d.text(21 * mm, d.y, n, 8.5)
        d.y -= 4.6 * mm
    d.y -= 3 * mm
    d.section('D. Valuation')
    recon_total = sum(v for _, v in t['recon'])
    d.table(['Reconditioning estimate', 'Amount (AUD)'], [(n, money(v)) for n, v in t['recon']],
            [130 * mm, 50 * mm], ['l', 'r'],
            total_rows=[('Total reconditioning', money(recon_total)), ('Market guide (wholesale, average condition)', money(t['marketGuide'])),
                        ('APPRAISED VALUATION', money(t['valuation']))])
    d.para(['Valuation honoured for 7 days provided kilometres do not increase by more than 500 km and condition does not change.',
            'Owner declares the vehicle has no undisclosed damage, is not a repairable write-off and has no finance other than declared.',
            'Synthetic demonstration document. All names, registrations and numbers are fictional.'])
    y = d.y - 10 * mm
    d.signature(15 * mm, y, 80 * mm, t['owner'], 'Owner', t['date'], seed=3)
    d.signature(110 * mm, y, 80 * mm, t['appraiser'], 'Appraiser', t['date'], seed=4)
    d.footer(f"Harbourline Toyota - Trade-in appraisal {t['ref']} - Synthetic sample for the Harbourline DMS demo")
    d.save()
    return dict(file=t['file'], kind='trade_in_form', title=f"Trade-in appraisal {t['ref']} - {t['year']} {t['make']} {t['model']}", dealNo=t['dealNo'],
                expected=dict(appraisalNo=t['ref'], dealNo=t['dealNo'], rego=t['rego'], state=t['state'], vin=t['vin'],
                              make=t['make'], model=t['model'], year=t['year'], km=t['km'], owner=t['owner'],
                              condition=t['condition'], reconditioningTotal=recon_total, valuation=t['valuation'],
                              appraiser=t['appraiser'], ownerSigned=True))


# ── 5-6. supplier invoices ──────────────────────────────────────────────────
INVOICES = [
    dict(file='invoice-SCA-204871.pdf', supplier='Southern Cross Auto Accessories Pty Ltd', abn=make_abn('53004821'),
         supplierLines=['Unit 4, 18 Victoria Street, Smithfield NSW 2164', 'accounts@sca-accessories.example - (02) 9725 3300'],
         invoiceNo='SCA-204871', invoiceDate='2026-10-08', dueDate='2026-11-07', po='HL-PO-7731',
         billTo=['Harbourline Toyota - Parramatta', 'Accounts payable', '120 Church Street, Parramatta NSW 2150'],
         lines=[('Towbar kit RAV4 2026, 2,000 kg, incl. wiring (HL-2231 / D-10482)', 1, 612.00),
                ('Weather shields RAV4, set of 4', 2, 118.50),
                ('Rubber cargo liner RAV4', 3, 74.90),
                ('Fitting labour (hours)', 2.5, 95.00)],
         terms='30 days. EFT: BSB 062-000 Acc 1048 2291 (fictional)'),
    dict(file='invoice-CTP-11093.pdf', supplier='Coastline Tint & Protect Pty Ltd', abn=make_abn('86120773'),
         supplierLines=['42 Leighton Place, Hornsby NSW 2077', 'billing@coastlinetint.example - (02) 9482 7716'],
         invoiceNo='CTP-11093', invoiceDate='2026-10-13', dueDate='2026-10-27', po='HL-PO-7764',
         billTo=['Harbourline Toyota - Hornsby', 'Accounts payable', '2 Pacific Highway, Hornsby NSW 2077'],
         lines=[('Ceramic window tint, Kluger (HL-1941 / D-10517)', 1, 420.00),
                ('Paint protection film, front bumper and bonnet', 1, 890.00),
                ('Interior fabric and leather protection', 2, 145.00),
                ('Roof crossbars Kluger, supply and fit', 1, 385.00)],
         terms='14 days. EFT: BSB 112-879 Acc 4417 0950 (fictional)'),
]


def build_invoice(v):
    lines = [(desc, qty, unit, round(qty * unit, 2)) for desc, qty, unit in v['lines']]
    sub = round(sum(l[3] for l in lines), 2)
    gst = round(sub * 0.10, 2)
    total = round(sub + gst, 2)
    d = Doc(os.path.join(OUT, v['file']), f"Tax invoice {v['invoiceNo']}")
    d.header(v['supplier'], v['supplierLines'] + [f"ABN {v['abn']}"], 'TAX INVOICE',
             [('Invoice no', v['invoiceNo']), ('Invoice date', v['invoiceDate']), ('Due date', v['dueDate'])],
             band=colors.HexColor('#2b3a36'))
    d.y -= 0
    d.section('Bill to')
    d.boxes([('Customer', v['billTo'][0]), ('Purchase order', v['po']), ('Attention', v['billTo'][1]), ('Address', v['billTo'][2])])
    d.section('Items')
    qfmt = lambda q: f"{q:g}"
    d.table(['Description', 'Qty', 'Unit price (ex GST)', 'Amount (ex GST)'],
            [(desc, qfmt(q), money(u, True), money(a, True)) for desc, q, u, a in lines],
            [104 * mm, 14 * mm, 31 * mm, 31 * mm], ['l', 'r', 'r', 'r'],
            total_rows=[('', '', 'Subtotal', money(sub, True)), ('', '', 'GST (10%)', money(gst, True)),
                        ('', '', 'TOTAL (incl. GST)', money(total, True))])
    d.section('Payment')
    d.boxes([('Terms', v['terms']), ('Amount due', money(total, True))], cols=1, h=9 * mm)
    d.para(['Goods remain the property of the supplier until paid in full. Please quote the invoice number with payment.',
            'Synthetic demonstration document. Supplier, ABN and bank details are fictional.'])
    d.footer(f"{v['supplier']} - ABN {v['abn']} - Tax invoice {v['invoiceNo']}")
    d.save()
    return dict(file=v['file'], kind='supplier_invoice', title=f"Tax invoice {v['invoiceNo']} - {v['supplier']}",
                expected=dict(supplier=v['supplier'], abn=v['abn'], invoiceNo=v['invoiceNo'], invoiceDate=v['invoiceDate'],
                              dueDate=v['dueDate'], purchaseOrder=v['po'], billTo=v['billTo'][0],
                              lines=[{'description': a, 'qty': b, 'unitPrice': c, 'amount': e} for a, b, c, e in lines],
                              subtotal=sub, gst=gst, total=total))


def main():
    os.makedirs(OUT, exist_ok=True)
    for x in INVOICES:
        assert abn_valid(x['abn']), x['abn']
    for k in CONTRACTS + TRADES:
        assert len(k['vin']) == 17, k['vin']
    manifest = [build_contract(k) for k in CONTRACTS] + [build_trade(t) for t in TRADES] + [build_invoice(v) for v in INVOICES]
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    for m in manifest:
        print(f"  wrote {m['file']}  ({m['kind']})")
    print(f"  wrote manifest.json ({len(manifest)} documents)")


if __name__ == '__main__':
    sys.exit(main())
