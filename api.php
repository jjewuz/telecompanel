<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

function getPrimaryKey($table) {
    $pk = $table . '_id';
    
    $special = [
        'subscribers' => 'subscriber_id',
        'payment_methods' => 'method_id',
        'tariffs' => 'tariff_id',
        'cities' => 'city_id',
        'services' => 'service_id'
    ];
    
    return $special[$table] ?? $pk;
}

$host = 'localhost';
$port = '5432'; 
$dbname = 'postgres';
$user = 'postgres';
$password = 'test';

try {
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=$dbname;options=--search_path=telecom", $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка подключения к базе: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? '';
$table = $_GET['table'] ?? '';
$id = $_GET['id'] ?? null;

if ($action === 'list') {
    $sql = "SELECT * FROM $table ORDER BY 1";
    $stmt = $pdo->query($sql);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

} elseif ($action === 'get') {
    $pk = getPrimaryKey($table);
    $stmt = $pdo->prepare("SELECT * FROM $table WHERE $pk = :id");
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        echo json_encode(['error' => 'Запись не найдена']);
        exit;
    }
    echo json_encode($row);

} elseif ($action === 'create') {
    $data = json_decode(file_get_contents('php://input'), true);
    $fields = array_keys($data);
    $placeholders = array_map(fn($f) => ":$f", $fields);
    $sql = "INSERT INTO $table (" . implode(',', $fields) . ") VALUES (" . implode(',', $placeholders) . ") RETURNING *";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($data);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));

} elseif ($action === 'update') {
    $data = json_decode(file_get_contents('php://input'), true);
    $pk = getPrimaryKey($table);
    $sets = array_map(fn($f) => "$f = :$f", array_keys($data));
    $sql = "UPDATE $table SET " . implode(', ', $sets) . " WHERE $pk = :id RETURNING *";
    $data['id'] = $id;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($data);
    echo json_encode($stmt->fetch(PDO::FETCH_ASSOC));

} elseif ($action === 'delete') {
    try {
        $pk = getPrimaryKey($table);

        $stmt = $pdo->prepare("DELETE FROM $table WHERE $pk = :id");
        $stmt->execute(['id' => $id]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        $errorMsg = $e->getMessage();
        if (str_contains($errorMsg, 'foreign key') || $e->getCode() == '23503') {
            $errorMsg = 'Нельзя удалить: на эту запись ссылаются другие таблицы';
        }
        echo json_encode(['error' => $errorMsg]);
    }

} elseif ($action === 'children') {
    $parent_id = $_GET['parent_id'];
    $sql = "SELECT * FROM $table WHERE subscriber_id = :pid ORDER BY 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['pid' => $parent_id]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

} elseif ($action === 'search_subscribers') {
    $query = '%' . ($_GET['q'] ?? '') . '%';
    $sql = "
        SELECT 
            s.subscriber_id, s.full_name, s.phone_number, 
            c.name AS city, t.name AS tariff
        FROM subscribers s
        LEFT JOIN cities c ON s.city_id = c.city_id
        LEFT JOIN tariffs t ON s.tariff_id = t.tariff_id
        WHERE s.full_name ILIKE :q OR s.phone_number ILIKE :q
        ORDER BY s.full_name
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['q' => $query]);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

} elseif ($action === 'report') {
    $proc = $_GET['proc'] ?? '';
    $subscriber_id = $_GET['subscriber_id'] ?? null;
    $year = $_GET['year'] ?? null;
    $month = $_GET['month'] ?? null;

    $result = [];

    if ($proc === 'top_debtors') {
        $stmt = $pdo->query("
            SELECT 
                s.subscriber_id,
                s.full_name,
                s.phone_number,
                telecom.calculate_current_debt(s.subscriber_id) AS debt
            FROM telecom.subscribers s
            WHERE telecom.calculate_current_debt(s.subscriber_id) > 0
            ORDER BY debt DESC
            LIMIT 10
        ");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } elseif ($proc === 'revenue_by_month') {
        $stmt = $pdo->query("
            SELECT 
                TO_CHAR(payment_date, 'YYYY-MM') AS month,
                SUM(amount) AS revenue
            FROM telecom.payments
            WHERE EXTRACT(YEAR FROM payment_date) = 2025
            GROUP BY TO_CHAR(payment_date, 'YYYY-MM')
            ORDER BY month
        ");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } elseif ($proc === 'top_cities') {
        $stmt = $pdo->prepare("SELECT * FROM telecom.top_cities_by_revenue('2025-01-01'::DATE, '2025-12-31'::DATE, 10)");
        $stmt->execute();
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } elseif ($proc === 'subscriber_usage' && $subscriber_id && $year && $month) {
        $stmt = $pdo->prepare("SELECT * FROM telecom.get_subscriber_usage(:sid, :y, :m)");
        $stmt->execute(['sid' => $subscriber_id, 'y' => $year, 'm' => $month]);
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } elseif ($proc === 'current_tariff') {
        $stmt = $pdo->query("
            SELECT 
                s.subscriber_id,
                s.full_name,
                t.tariff_name,
                t.monthly_fee,
                t.description
            FROM telecom.subscribers s
            CROSS JOIN LATERAL telecom.get_current_tariff_info(s.subscriber_id) t
        ");
        $result = $stmt->fetchAll(PDO::FETCH_ASSOC);

    } else {
        echo json_encode(['error' => 'Неизвестный отчёт или недостаточно параметров']);
        exit;
    }

    echo json_encode($result);

} elseif ($action === 'view') {
    $view = $_GET['view'];
    $stmt = $pdo->query("SELECT * FROM $view");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));

} else {
    echo json_encode(['error' => 'Неизвестное действие']);
}
?>