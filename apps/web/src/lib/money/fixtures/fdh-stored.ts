/** A small REP + STM set in the shape `GET /api/money/fdh/documents?full=1` returns: one paid, one pending, one ติด C (and fixed). */
const rc = (o: Record<string, unknown>) => ({ rep_no: '691000001', tran_id: `t${String(o.seq ?? 'A')}`, hn: 'H1', an: '', pid: '3100000000001', name: 'สมชาย ใจดี', ptype: 'OP',
  visit_date: '2026-10-01', charge: 100, net: 80, error_code: '-', main_fund: 'UCS', sub_fund: 'HERB_FS', right: 'UCS', pay_mode: '', seq: 'A', ...o });
const sr = (o: Record<string, unknown>) => ({ kind: 'normal', rep_no: '691000001', tran_id: `t${String(o.seq ?? 'A')}`, hn: 'H1', pid: '3100000000001', name: 'สมชาย ใจดี', visit_date: '2026-10-01',
  maininscl: 'UCS', charge: 100, op: 0, ip_calc: 0, ip_paid: 0, hc: 0, hc_drug: 0, ae: 0, ae_drug: 0, inst: 0, dmis_calc: 0, dmis_paid: 0,
  dmis_drug: 0, palliative: 0, dmishd: 0, pp: 0, fs: 80, opbkk: 0, total: 80, source: 'FDH', seq: 'A', ...o });

export const fdhStored = {
  reps: [
    { type: 'rep', doc_no: 'eclaim_1', hcode: '11093', hname: 'วาริชภูมิ', report_date: '2026-10-20', file_name: 'rep1.xlsx', uploaded_at: '2026-11-17T03:00:00.000Z',
      cases: [
        rc({}),
        rc({ seq: 'B', visit_date: '2026-10-05', charge: 200, net: 150, sub_fund: 'TELEMED' }),
        rc({ seq: 'C', hn: 'H2', pid: '3100000000002', name: 'สมหญิง ดีใจ', visit_date: '2026-10-10', charge: 50, net: 0, error_code: '237', sub_fund: '', right: 'OFC' }),
        rc({ seq: 'D', hn: 'H2', pid: '3100000000002', name: 'สมหญิง ดีใจ', visit_date: '2026-10-12', charge: 60, net: 0, error_code: '804', sub_fund: 'TELEMED' })
      ],
      denies: [{ tran_id: 'tC', fund: 'UCS', code: 'X1', category: 'ยา', qty: 1, deny: 'D01' }]
    },
    { type: 'rep', doc_no: 'eclaim_2', hcode: '11093', hname: 'วาริชภูมิ', report_date: '2026-10-25', file_name: 'rep2.xlsx', uploaded_at: '2026-11-18T04:30:00.000Z',
      cases: [rc({ seq: 'D', rep_no: '691000009', hn: 'H2', pid: '3100000000002', name: 'สมหญิง ดีใจ', visit_date: '2026-10-12', charge: 60, net: 60, sub_fund: 'TELEMED' })], denies: [] }
  ],
  stms: [
    { type: 'stm', doc_no: 'stm_1', hcode: '11093', hname: '', period: '6910_OP_02', report_date: '2026-11-01', file_name: 'stm1.xlsx', uploaded_at: '2026-11-17T03:05:00.000Z',
      rows: [sr({}), sr({ seq: 'D', hn: 'H2', pid: '3100000000002', name: 'สมหญิง ดีใจ', visit_date: '2026-10-12', charge: 60, fs: 0, op: 60, total: 60 })] }
  ]
};
