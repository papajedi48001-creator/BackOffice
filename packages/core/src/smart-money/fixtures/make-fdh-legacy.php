<?php
// Builds parity fixtures for the BackOffice FDH parsers from the legacy PHP tests' synthetic workbooks (no real patients).
// Run: php packages/core/src/smart-money/fixtures/make-fdh-legacy.php [legacy-repo-dir] > packages/core/src/smart-money/fixtures/fdh-legacy.json
function check($c, $m) {} function same($e, $a, $m) {} function throws($f, $n, $m) { try { $f(); } catch (Throwable $e) {} }
$legacy = $argv[1] ?? '/home/user/smart_money_waritchaphum';
require $legacy . '/tests/fdh/FdhRepParserTest.php';
require $legacy . '/tests/fdh/FdhStmParserTest.php';

$cases = [];
$add = function (string $name, string $parser, array $sheets, string $fileName) use (&$cases) {
    $input = json_encode($sheets, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    $decoded = json_decode($input, true);   // as upload.php received it from the browser
    $entry = ['name' => $name, 'parser' => $parser, 'fileName' => $fileName, 'sheets' => json_decode($input)];
    try {
        if ($parser === 'rep') $doc = FdhRepParser::parse($decoded, $fileName);
        elseif ($parser === 'stm') $doc = FdhStmParser::parse($decoded, $fileName);
        elseif (FdhRepParser::isRep($decoded)) $doc = FdhRepParser::parse($decoded, $fileName);
        elseif (FdhStmParser::isStm($decoded)) $doc = FdhStmParser::parse($decoded, $fileName);
        else throw new InvalidArgumentException('ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH');
        $entry['expected'] = $doc;
    } catch (InvalidArgumentException $e) { $entry['error'] = $e->getMessage(); }
    $cases[] = $entry;
};
$add('rep with deny', 'any', ['Detail' => fdh_rep_detail($repRows), 'Summary' => [], 'Data DENY' => $deny], 'x.xls');
$add('rep with drugs', 'any', ['Detail' => fdh_rep_detail($repRows), 'Data Drug' => $dataDrug], 'x.xls');
$add('rep columns by header name', 'any', ['Detail' => fdh_rep_detail($repRows, true)], 'x.xls');
$add('rep without Detail', 'rep', ['Sheet1' => [['a']]], 'a.xls');
$x = fdh_rep_detail($repRows); $x[5][117] = 'XX';
$add('rep missing SEQ NO', 'any', ['Detail' => $x], 'a.xls');
$x = fdh_rep_detail($repRows); $x[1][15] = '';
$add('rep doc_no from file name', 'any', ['Detail' => $x], 'eclaim_11093_OP_1.xls');
$add('rep bad doc_no', 'any', ['Detail' => $x], '../bad name.xls');
$add('stm three kinds', 'any', $sheets, 'STM_11093_OPUCS256910_02.xls');
$add('stm float seq', 'any', $f, 'a.xls');
$add('stm not stm', 'stm', ['Detail' => [['REP No.']]], 'a.xls');
$add('stm header mismatch', 'any', $bad, 'a.xls');
$add('stm D1 two blocks and legend', 'any', $s2, 'a.xls');
$add('neither', 'any', ['Sheet1' => [['a']]], 'a.xls');
echo json_encode($cases, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
