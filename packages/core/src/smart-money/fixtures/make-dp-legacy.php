<?php
// Builds parity fixtures for the BackOffice Point ฟื้นฟูผู้พิการ parser from the legacy PHP test rows (synthetic people only).
// Run: php packages/core/src/smart-money/fixtures/make-dp-legacy.php [legacy-repo-dir] > packages/core/src/smart-money/fixtures/dp-legacy.json
function check($c, $m) {} function same($e, $a, $m) {} function throws($f, $n, $m) { try { $f(); } catch (Throwable $e) {} }
$legacy = $argv[1] ?? '/home/user/smart_money_waritchaphum';
require $legacy . '/tests/disability_point/DpParserTest.php';

$cases = [];
$add = function (string $name, array $rows) use (&$cases) {
    $input = json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    $decoded = json_decode($input, true);   // as upload.php received it from the browser
    $entry = ['name' => $name, 'rows' => json_decode($input), 'isDp' => DpParser::isDp($decoded)];
    try { $entry['expected'] = DpParser::parse($decoded); } catch (InvalidArgumentException $e) { $entry['error'] = $e->getMessage(); }
    $cases[] = $entry;
};
$bom = $H; $bom[0] = "\u{FEFF}" . $bom[0];
$noAf = $H; unset($noAf[31]); $noAf = array_values($noAf);
$noBoth = $H; unset($noBoth[31], $noBoth[7]); $noBoth = array_values($noBoth);
$dup = $H; $dup[] = 'HN';
$add('two rows with status, collapsed service, comma money, end of ปีงบ', [$H, $row(), $row(['เลขที่อ้างอิง' => '10000002', 'สถานะ' => 'D24,', 'ชื่อบริการฟื้นฟู' => 'จิตบำบัด  (รหัสรายบุคคล)', 'รวมราคาที่ขอเบิก' => '1,250', 'วันที่รับบริการ' => '30/9/2567'])]);
$add('Excel numbers and ISO date', [$H, $row(['วันที่รับบริการ' => '2025-01-05', 'รวมราคาที่ขอเบิก' => 300, 'รหัสบัตรประชาชน' => 1111111111111])]);
$add('blank rows skipped, rows without ref or date counted', [$H, $row(), [], ['', ''], $row(['เลขที่อ้างอิง' => '']), $row(['เลขที่อ้างอิง' => '9', 'วันที่รับบริการ' => 'abc'])]);
$add('header below title rows', [['รายงานบริการฟื้นฟู'], [], $H, $row()]);
$add('header with BOM', [$bom, $row()]);
$add('missing รวมราคาที่พึงเบิกได้', [$noAf, $row()]);
$add('missing two columns', [$noBoth, ['x']]);
$add('not a DP file', [['a', 'b']]);
$add('REP file is not DP', [['REP No.', 'TRAN_ID'], ['1', '2']]);
$add('header after row 10 is not found', array_merge(array_fill(0, 10, ['x']), [$H, $row()]));
$add('dates with time, C.E., bad day, status list, NBSP in service, decimals', [$H,
    $row(['วันที่รับบริการ' => '2/10/2566 10:30', 'วันที่บันทึก' => '3/10/2023', 'เริ่มบริการฟื้นฟู' => '31/2/2567', 'สิ้นสุดบริการฟื้นฟู' => '2024-1-5', 'สถานะ' => ' D24, 305 ,', 'ชื่อบริการฟื้นฟู' => " กิจกรรม\u{A0}บำบัด\t ", 'รวมราคาที่ขอเบิก' => 1.5, 'รวมราคาที่พึงเบิกได้' => '1 250.75', 'จำนวน' => '2.0', 'ครั้งที่' => '3.9']),
    $row(['เลขที่อ้างอิง' => 10000003.0, 'วันที่รับบริการ' => '29/2/2567', 'รวมราคาที่ขอเบิก' => '-', 'รวมราคาที่พึงเบิกได้' => 'abc', 'HN' => true, 'ชื่อ' => '', 'นามสกุล' => 'สมมติ']),
    $row(['เลขที่อ้างอิง' => '10000004', 'วันที่รับบริการ' => '29/2/2566'])]);
$add('hcode from the first row that has one; duplicate header keeps the first', [$dup, $row(['รหัสหน่วยบริการ' => '', 'ชื่อหน่วยบริการ' => 'ไม่ใช้']), array_merge($row(['รหัสหน่วยบริการ' => '11094', 'ชื่อหน่วยบริการ' => 'รพ.สอง', 'เลขที่อ้างอิง' => '10000005']), ['999'])]);
$add('optional columns absent', [['วันที่รับบริการ', 'ชื่อบริการฟื้นฟู', 'รวมราคาที่ขอเบิก', 'รวมราคาที่พึงเบิกได้', 'เลขที่อ้างอิง'], ['1/10/2568', 'กายภาพบำบัด', '100', '90', 'R1'], null]);
echo json_encode($cases, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
