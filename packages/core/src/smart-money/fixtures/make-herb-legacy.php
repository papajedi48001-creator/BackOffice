<?php
// Expected การจ่ายยาสมุนไพร summaries from the legacy PHP code (ongrx25/Smart_Money_Waritchaphum, modules/herb_dispense) on made-up rows.
// Run: php packages/core/src/smart-money/fixtures/make-herb-legacy.php [legacy-repo-dir]
$legacy = $argv[1] ?? '/home/user/smart_money_waritchaphum';
require $legacy . '/modules/herb_dispense/HerbSummary.php';
mt_srand(6);
$pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];
$herbs = array_keys(require $legacy . '/modules/ttm_monitor/herb_icodes.php');
$herbs = array_map('strval', $herbs);
$pttypes = [['10', 'ข้าราชการ จ่ายตรง', 'OFC'], ['L1', 'อปท.', 'LGO'], ['89', 'UC ในเขต', 'UCS'], ['89', 'UC ในเขต', 'UCS'], ['A1', 'ชำระเงินเอง', ''],
    ['S1', 'ประกันสังคม', 'SSS'], ['12', 'เบิกได้ ออกใบเสร็จ', 'OFC'], ['99', 'ต่างด้าว', 'NRD'], ['', '', ''], [null, null, null]];
$dates = ['2026-10-01', '2026-10-02', '2026-11-05', '2026-11-05 00:00:00', '2026-11-06'];
$rows = [];
for ($i = 1; $i <= 60; $i++) {
    $vn = sprintf('6911%08d', $i);
    $hn = mt_rand(0, 12) === 0 ? '' : sprintf('%06d', mt_rand(1, 25));
    $an = mt_rand(0, 7) === 0 ? '69000' . mt_rand(1, 4) : (mt_rand(0, 1) ? '' : null);
    $pt = $pick($pttypes);
    $n = mt_rand(1, 4);
    for ($k = 0; $k < $n; $k++) {
        $icode = mt_rand(0, 9) === 0 ? '9999999' : $pick($herbs);
        $qty = $pick([1, 2, 5, 10, 20, 42, '3', 0.5]);
        $rows[] = ['rxdate' => $pick($dates), 'vn' => $vn, 'an' => $an, 'hn' => $hn, 'icode' => $icode,
            'drug_name' => mt_rand(0, 9) === 0 ? '' : 'ยา ' . $icode, 'units' => $pick(['cap', 'ขวด', '', null]),
            'qty' => $qty, 'sum_price' => $pick([20, 45.25, 0, '84.00', null, 13.335]),
            'unitcost' => $pick([1.5, 0.66, null, '2.25', 0]), 'stdprice' => $pick([2, 0, '', null, '1.75', 3.333]),
            'pttype' => $pt[0], 'pttype_name' => $pt[1], 'hipdata_code' => $pt[2]];
        if (mt_rand(0, 5) === 0) { // same vn|icode again on another day
            $rows[] = array_merge(end($rows), ['rxdate' => $pick($dates)]);
        }
    }
}
// REP documents: HERB_FS cases (alone, mixed, lower case), other funds, a later report replacing a TRAN_ID, seq with spaces.
$docs = [];
for ($d = 0; $d < 3; $d++) {
    $cases = []; $drugs = [];
    for ($c = 1; $c <= 25; $c++) {
        $src = $pick($rows);
        $vn = mt_rand(0, 9) === 0 ? sprintf('6911%08d', mt_rand(61, 70)) : $src['vn'];
        $tran = 'T' . mt_rand(1, 40);
        $cases[] = ['tran_id' => $tran, 'seq' => $pick(['', '', ' ']) . $vn . $pick(['', '', ' ']),
            'sub_fund' => $pick(['HERB_FS', 'HERB_FS,OPAE,OPAE-DRUG', 'herb_fs', 'OPAE', 'HERB_GB', '', 'DRUG_DELIVERY, HERB_FS'])];
        $m = mt_rand(0, 3);
        for ($k = 0; $k < $m; $k++) {
            $drugs[] = ['tran_id' => $pick([$tran, $tran, 'ZZ']), 'icode' => $pick([$src['icode'], $src['icode'], $pick($herbs), '1000211', '', ' ' . $src['icode'] . ' ']),
                'type' => $pick(['H000601', 'H000601', 'h000101', 'DrugsFS', '', ' H1']), 'paid' => $pick([92, 40, 0, 43.5, '50', null])];
        }
    }
    $docs[] = ['doc_no' => 'D' . (3 - $d), 'report_date' => $pick(['2026-11-10', '2026-11-06', '']), 'cases' => $cases, 'drugs' => $drugs];
}
$received = HerbSummary::receivedFromRep($docs);
$cases = [
    'default' => ['settings' => [], 'rep' => false],
    'rep' => ['settings' => [], 'rep' => true],
    'points' => ['settings' => ['point_baht' => '0.5'], 'rep' => true],
    'mapped' => ['settings' => ['point_baht' => 'abc'], 'ttm' => ['right_map' => '99:uc,10:uc'], 'rep' => false],
];
$out = ['rows' => $rows, 'docs' => $docs, 'received' => $received, 'cases' => []];
foreach ($cases as $name => $c) {
    $rules = HerbSummary::rules($c['settings'], $c['ttm'] ?? []);
    $out['cases'][$name] = ['settings' => $c['settings'], 'ttm' => $c['ttm'] ?? (object)[], 'rep' => $c['rep'],
        'expected' => HerbSummary::summarize($rows, $rules, $c['rep'] ? $received : null)];
}
file_put_contents(__DIR__ . '/herb-legacy.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION) . "\n");
echo "wrote herb-legacy.json\n";
