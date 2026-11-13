<?php
// Expected dental summaries from the legacy PHP code (ongrx25/Smart_Money_Waritchaphum, modules/dental_claims).
// Run: php packages/core/src/smart-money/fixtures/make-expected.php [legacy-repo-dir]
$legacy = $argv[1] ?? '/home/user/smart_money_waritchaphum';
require $legacy . '/modules/dental_claims/DentalClaimsRepository.php';
$rows = json_decode(file_get_contents(__DIR__ . '/dental-rows.json'), true);
$legacyRows = array_map(fn($r) => ['vn' => $r['vn'], 'vstdate' => $r['vstdate'], 'hn' => $r['hn'], 'patient_name' => $r['patientName'], 'diag_code' => $r['diagCode'], 'diag_name' => $r['diagName'], 'pttype_code' => $r['pttypeCode'], 'pttype_name' => $r['pttypeName'], 'paccount_name' => $r['paccountName'], 'total_amount' => $r['totalAmount'], 'paid_money' => $r['paidMoney'], 'claim_amount' => $r['claimAmount']], $rows);
$out = [];
foreach (['pttype', 'paccount'] as $group) {
    foreach (['day', 'month'] as $period) {
        $s = DentalClaimsRepository::summarize($legacyRows, $group, $period);
        $out["$group:$period"] = ['rows' => $s['rows'], 'visits' => $s['visits'], 'patients' => $s['patients'], 'total' => $s['total'], 'paid' => $s['paid'], 'claim' => $s['claim'], 'byPeriod' => $s['by_period'], 'byGroup' => $s['by_group'], 'byDiag' => $s['by_diag']];
    }
}
file_put_contents(__DIR__ . '/dental-expected.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION) . "\n");
echo "wrote dental-expected.json\n";
