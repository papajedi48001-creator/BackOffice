<?php
// Expected monitor แพทย์แผนไทย summaries from the legacy PHP code (ongrx25/Smart_Money_Waritchaphum, modules/ttm_monitor) on made-up rows.
// Run: php packages/core/src/smart-money/fixtures/make-ttm-legacy.php [legacy-repo-dir]
$legacy = $argv[1] ?? '/home/user/smart_money_waritchaphum';
require $legacy . '/modules/ttm_monitor/TtmSummary.php';
mt_srand(5);
$pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];
$procedures = array_keys(TtmSummary::procedures());
$herbs = array_keys(require $legacy . '/modules/ttm_monitor/herb_icodes.php');
$pttypes = [['10', 'ข้าราชการ จ่ายตรง', 'OFC'], ['L1', 'อปท.', 'LGO'], ['89', 'UC ในเขต', 'UCS'], ['A1', 'ชำระเงินเอง', ''], ['S1', 'ประกันสังคม', 'SSS'],
    ['12', 'เบิกได้ ออกใบเสร็จ', 'OFC'], ['99', 'ต่างด้าว', 'NRD'], ['77', 'สิทธิ uc พิเศษ', ''], ['', '', '']];
$types = [['1', 'ในหน่วยบริการ'], ['2', 'ผู้ป่วยใน'], ['3', ''], ['4', 'นอกหน่วยบริการ']];
$doctors = ['แพทย์แผนไทย ก', 'แพทย์แผนไทย ข', '', 'ผู้ช่วย ค'];
$treatments = ['นวด', 'ประคบ', 'อบ', '', 'พอกเข่า'];
$times = ['09:00:00', '13:30:00', '16:00:00', '16:30:00', '17:5', '8.15', '', '18:00'];
$dates = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-15', '2026-11-05', '2026-11-06'];
$extraNames = [['N1', 'นวดไทยเพื่อการรักษา', '13', 'ค่าบริการ', 0], ['N2', 'อบไอน้ำสมุนไพร', '13', '', 0], ['N3', 'ค่าบริการผู้ป่วยนอก', '14', '', 0],
    ['D1', 'Paracetamol 500', '03', 'ค่ายา', 1], ['D2', 'ฟ้าทะลายโจร', '04', 'ค่ายาแผนไทย', 1], ['L1', 'CBC', '07', 'ค่าตรวจ', 0], ['N4', 'หัตถการพิเศษ', '13', '', 0]];
$services = []; $visits = []; $items = [];
for ($i = 1; $i <= 70; $i++) {
    $vn = sprintf('6911%08d', $i);
    $hn = sprintf('%06d', mt_rand(1, 30));
    $date = $pick($dates);
    $pt = $pick($pttypes);
    if (mt_rand(0, 9) > 0) {
        $visits[] = ['vn' => $vn, 'an' => mt_rand(0, 9) === 0 ? '69000' . $i : (mt_rand(0, 1) ? '' : null), 'pttype' => $pt[0], 'pttype_name' => $pt[1], 'hipdata_code' => $pt[2]];
    }
    $rowsHere = mt_rand(1, 3);
    for ($r = 0; $r < $rowsHere; $r++) {
        $type = $pick($types);
        $services[] = ['vn' => $i === 70 ? '' : $vn, 'hn' => $hn, 'an' => mt_rand(0, 14) === 0 ? '69001' . $i : '', 'service_date' => $date, 'service_time' => $pick($times),
            'health_med_service_type_id' => $type[0], 'health_med_service_type_name' => $type[1], 'health_med_doctor_name' => $pick($doctors),
            'health_med_treatment_type_name' => $pick($treatments), 'pateint_name' => 'ผู้ป่วยสมมติ ' . $hn];
    }
    $n = mt_rand(0, 5);
    for ($k = 0; $k < $n; $k++) {
        $roll = mt_rand(0, 9);
        if ($roll < 4) { $code = $pick($procedures); $items[] = ['vn' => $vn, 'icode' => $code, 'income' => '13', 'income_name' => 'ค่าบริการฝังเข็ม', 'item_name' => 'ชื่อ ' . $code, 'is_drug' => 0, 'qty' => 1, 'amount' => $pick([100, 150, 200, 250.5])]; }
        elseif ($roll < 7) { $code = $pick($herbs); $items[] = ['vn' => $vn, 'icode' => $code, 'income' => '04', 'income_name' => 'ค่ายา', 'item_name' => 'ยา ' . $code, 'is_drug' => 1, 'qty' => mt_rand(1, 3), 'amount' => $pick([30, 45.25, 60, -10])]; }
        elseif ($roll < 8) { $items[] = ['vn' => $vn, 'icode' => '3015968', 'income' => '14', 'income_name' => '', 'item_name' => 'IMC', 'is_drug' => 0, 'qty' => 1, 'amount' => 50]; }
        else { $e = $pick($extraNames); $items[] = ['vn' => $vn, 'icode' => $e[0], 'income' => $e[2], 'income_name' => $e[3], 'item_name' => $e[1], 'is_drug' => $e[4], 'qty' => 1, 'amount' => $pick([80, 120.75])]; }
    }
}
$items[] = ['vn' => 'zz', 'icode' => '3015001', 'income' => '13', 'income_name' => '', 'item_name' => 'นวด', 'is_drug' => 0, 'qty' => 1, 'amount' => 999];
$cases = ['default' => [], 'custom' => ['right_map' => '99:cash,77:sss', 'kind_map' => '3015001:compress', 'herb_income' => '03', 'after_hours_from' => '13.00', 'auto_detect' => 'false']];
$out = ['services' => $services, 'visits' => $visits, 'items' => $items, 'cases' => []];
foreach ($cases as $name => $custom) {
    $out['cases'][$name] = ['settings' => $custom, 'expected' => TtmSummary::summarize($services, $visits, $items, TtmSummary::rules($custom))];
}
file_put_contents(__DIR__ . '/ttm-legacy.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION) . "\n");
echo "wrote ttm-legacy.json\n";
