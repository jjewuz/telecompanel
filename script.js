let role = '';
let currentFields = [];

function enterAs(r) {
    role = r;
    document.getElementById('role-text').textContent = r === 'admin' ? 'Администратор' : 'Абонент';
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');

    if (role === 'user') {
        loadSubscriberDetail(1);
    } else {
        showSection('subscribers');
    }
}

function logout() {
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
}

async function api(endpoint, options = {}) {
    const res = await fetch(`api.php${endpoint}`, {
        ...options,
        headers: {'Content-Type': 'application/json', ...options.headers || {}}
    });
    return await res.json();
}

async function loadDirectory(table, title, fields, visibleForUser = false) {
    if (role === 'user' && !visibleForUser) {
        document.getElementById('content').innerHTML = '<h2>Доступ запрещён</h2>';
        return;
    }
    const data = await api(`?action=list&table=${table}`);
    let html = `<h2>${title}</h2>`;
    
    if (role === 'admin') {
        html += `<button onclick="showForm('create', '${table}')">Добавить новую запись</button><br><br>`;
    }
    
    html += '<table><tr>';
    fields.forEach(f => html += `<th>${formatLabel(f)}</th>`);
    if (role === 'admin') html += '<th>Действия</th>';
    html += '</tr>';
    
        if (data.length === 0) {
        const colspan = fields.length + (role === 'admin' ? 1 : 0);
        html += `<tr><td colspan="${colspan}">Нет записей</td></tr>`;
    } else {
        data.forEach(row => {
            // Сначала особенные случаи
            let pk = null;
            if (table === 'subscribers') pk = row.subscriber_id;
            else if (table === 'payment_methods') pk = row.method_id;
            else if (table === 'tariffs') pk = row.tariff_id;
            else if (table === 'cities') pk = row.city_id;
            else if (table === 'services') pk = row.service_id;
            else pk = row[table + '_id']; // стандартный случай

            if (pk === undefined || pk === null) {
                console.warn('PK не найден для строки в таблице ' + table, row);
                pk = null;
            }

            html += '<tr>';
            fields.forEach(f => html += `<td>${row[f] ?? ''}</td>`);
            if (role === 'admin') {
                if (pk !== null) {
                    html += `<td>
                        <button onclick="showForm('update', '${table}', ${pk})">Изменить</button>
                        <button onclick="deleteRecord('${table}', ${pk})">Удалить</button>
                    </td>`;
                } else {
                    html += '<td>—</td>';
                }
            }
            html += '</tr>';
        });
    }
    html += '</table>';
    document.getElementById('content').innerHTML = html;
}

async function loadSubscribersMasterDetail() {
    const subs = await api('?action=list&table=subscribers');
    let html = '<h2>Абоненты</h2><table><thead><tr><th>ФИО</th><th>Телефон</th><th>Город</th><th>Тариф</th><th>Действия</th></tr></thead><tbody>';
    for (const s of subs) {
        if (!s.subscriber_id) continue; // защита
        html += `<tr>
            <td>${s.full_name}</td><td>${s.phone_number}</td><td>${s.city_id || ''}</td><td>${s.tariff_id || ''}</td>
            <td><button onclick="loadSubscriberDetail(${s.subscriber_id})">Подробно</button></td>
        </tr>`;
    }
    html += '</tbody></table>';
    if (role === 'admin') {
        html += `<br><button onclick="showForm('create', 'subscribers', ['full_name', 'phone_number', 'address', 'city_id', 'tariff_id'])">Добавить абонента</button>`;
    }
    document.getElementById('content').innerHTML = html;
}
async function loadSubscriberDetail(id) {
    if (!id) {
        document.getElementById('content').innerHTML = '<h2>Ошибка: ID абонента не передан</h2>';
        return;
    }

    const sub = await api(`?action=get&table=subscribers&id=${id}`);
    if (sub.error) {
        document.getElementById('content').innerHTML = '<h2>Абонент не найден</h2>';
        return;
    }

    let html = `<h2>Абонент: ${sub.full_name} (${sub.phone_number})</h2>
        <button onclick="loadSubscribersMasterDetail()">← Назад к списку абонентов</button><br><br>`;

    if (role === 'admin') {
        html += `<button onclick="showUnifiedAddForm(${id})">Добавить запись (звонок, СМС, интернет, платёж)</button><br><br>`;
    }

    const tables = [
        {table: 'calls', title: 'Звонки', pk: 'call_id', fields: ['service_id', 'call_date', 'duration_sec', 'roaming', 'cost']},
        {table: 'internet_sessions', title: 'Интернет-сессии', pk: 'session_id', fields: ['service_id', 'start_time', 'end_time', 'data_used_mb', 'cost']},
        {table: 'sms', title: 'СМС', pk: 'sms_id', fields: ['service_id', 'send_time', 'is_roaming', 'cost']},
        {table: 'payments', title: 'Платежи', pk: 'payment_id', fields: ['payment_date', 'amount', 'method_id']}
    ];

    for (const t of tables) {
        const all = await api(`?action=list&table=${t.table}`);
        const childData = all.filter(row => row.subscriber_id == id);

        html += `<h3>${t.title} (${childData.length} записей)</h3>`;

        if (childData.length === 0) {
            html += '<p>Нет записей</p><br>';
        } else {
            html += '<table><tr>';
            t.fields.forEach(f => html += `<th>${formatLabel(f)}</th>`);
            if (role === 'admin') html += '<th>Действия</th>';
            html += '</tr>';
            childData.forEach(row => {
                const recordId = row[t.pk];
                html += '<tr>';
                t.fields.forEach(f => html += `<td>${row[f] ?? ''}</td>`);
                if (role === 'admin') {
                    html += `<td>
                        <button data-type="edit" data-table="${t.table}" data-subid="${id}" data-recid="${recordId}" data-fields="${t.fields.join(',')}">Изменить</button>
                        <button data-type="delete" data-table="${t.table}" data-recid="${recordId}" data-subid="${id}">Удалить</button>
                    </td>`;
                }
                html += '</tr>';
            });
            html += '</table><br>';
        }
    }

    document.getElementById('content').innerHTML = html;

    // Обработчики для кнопок действий
    document.querySelectorAll('button[data-type="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const table = btn.dataset.table;
            const subid = btn.dataset.subid;
            const recid = btn.dataset.recid;
            const fields = btn.dataset.fields.split(',');
            showChildEditForm(table, subid, recid, fields);
        });
    });

    document.querySelectorAll('button[data-type="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const table = btn.dataset.table;
            const subid = btn.dataset.subid;
            const recid = btn.dataset.recid;
            const fields = btn.dataset.fields.split(',');
            showChildEditForm(table, subid, recid, fields);
        });
    });

    document.querySelectorAll('button[data-type="delete"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const table = btn.dataset.table;
            const recid = btn.dataset.recid;
            const subid = btn.dataset.subid;
            deleteChildRecord(table, recid, subid);
        });
    });
}

function showChildEditForm(table, subscriber_id, record_id, fields) {
    api(`?action=get&table=${table}&id=${record_id}`).then(data => {
        let html = `<h2>Редактирование записи в ${formatTitle(table)}</h2><form id="crud-form">`;

        fields.forEach(f => {
            if (f === 'service_id') {
                html += `<label>${formatLabel(f)}</label><br><select name="service_id" required></select><br><br>`;
            } else if (f === 'method_id') {
                html += `<label>${formatLabel(f)}</label><br><select name="method_id" required></select><br><br>`;
            } else if (f === 'roaming' || f === 'is_roaming') {
                html += `<label>${formatLabel(f)}</label><br><input type="checkbox" name="${f}" ${data[f] ? 'checked' : ''}><br><br>`;
            } else {
                html += `<label>${formatLabel(f)}</label><br><input type="text" name="${f}" value="${data[f] ?? ''}" required><br><br>`;
            }
        });

        html += `<input type="hidden" name="subscriber_id" value="${subscriber_id}">
                 <button type="button" onclick="saveChildRecord('update', '${table}', ${record_id}, ${subscriber_id})">Сохранить</button>
                 <button type="button" onclick="loadSubscriberDetail(${subscriber_id})">Отмена</button></form>`;

        document.getElementById('content').innerHTML = html;

        // Заполняем списки (как в add)
        if (fields.includes('service_id')) {
            api('?action=list&table=services').then(services => {
                const select = document.querySelector('select[name="service_id"]');
                select.innerHTML = '<option value="">— Выберите услугу —</option>';
                services.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.service_id;
                    opt.textContent = s.name;
                    if (s.service_id == data.service_id) opt.selected = true;
                    select.appendChild(opt);
                });
            });
        }
    });
}

async function deleteChildRecord(table, record_id, subscriber_id) {
    if (confirm('Удалить эту запись?')) {
        const result = await api(`?action=delete&table=${table}&id=${record_id}`, {method: 'DELETE'});
        if (result.success) {
            alert('Запись удалена');
        } else {
            alert(result.error || 'Ошибка удаления');
        }
        loadSubscriberDetail(subscriber_id);
    }
}

async function saveChildRecord(mode = 'create', table, record_id = null, subscriber_id) {
    const form = document.getElementById('crud-form');
    const data = {};
    new FormData(form).forEach((value, key) => {
        if (value !== '' && value !== 'off') {
            if (value === 'on') data[key] = true;
            else data[key] = value.trim();
        }
    });

    const url = mode === 'update' ? `?action=update&table=${table}&id=${record_id}` : `?action=create&table=${table}`;
    const method = mode === 'update' ? 'PUT' : 'POST';

    const result = await api(url, {method, body: JSON.stringify(data)});

    if (result.error) {
        alert('Ошибка: ' + result.error);
    } else {
        alert('Запись сохранена!');
        loadSubscriberDetail(subscriber_id);
    }
}

function showUnifiedAddForm(subscriber_id) {
    let html = `<h2>Добавление записи для абонента</h2><form id="crud-form">`;

    html += `<label>Тип записи</label><br>
             <select id="record-type" onchange="updateAddForm(${subscriber_id})" required>
                 <option value="">— Выберите тип —</option>
                 <option value="call">Звонок</option>
                 <option value="internet">Интернет-сессия</option>
                 <option value="sms">СМС</option>
                 <option value="payment">Платёж</option>
             </select><br><br>`;

    html += `<div id="dynamic-fields"></div>`;

    html += `<input type="hidden" name="subscriber_id" value="${subscriber_id}">
             <button type="button" onclick="saveUnifiedRecord(${subscriber_id})" style="display:none;" id="save-btn">Сохранить</button>
             <button type="button" onclick="loadSubscriberDetail(${subscriber_id})">Отмена</button></form>`;

    document.getElementById('content').innerHTML = html;
}

function updateAddForm(subscriber_id) {
    const type = document.getElementById('record-type').value;
    let fieldsHtml = '';

    if (type === 'call') {
        fieldsHtml += `<label>Услуга</label><br><select name="service_id" required></select><br><br>`;
        fieldsHtml += `<label>Дата и время звонка</label><br><input type="datetime-local" name="call_date" required><br><br>`;
        fieldsHtml += `<label>Длительность (сек)</label><br><input type="number" name="duration_sec" required><br><br>`;
        fieldsHtml += `<label>Роуминг</label><br><input type="checkbox" name="roaming"><br><br>`;
        fieldsHtml += `<label>Стоимость</label><br><input type="number" step="0.01" name="cost" required><br><br>`;
    } else if (type === 'internet') {
        fieldsHtml += `<label>Услуга</label><br><select name="service_id" required></select><br><br>`;
        fieldsHtml += `<label>Начало сессии</label><br><input type="datetime-local" name="start_time" required><br><br>`;
        fieldsHtml += `<label>Конец сессии</label><br><input type="datetime-local" name="end_time" required><br><br>`;
        fieldsHtml += `<label>Трафик (МБ)</label><br><input type="number" step="0.01" name="data_used_mb" required><br><br>`;
        fieldsHtml += `<label>Стоимость</label><br><input type="number" step="0.01" name="cost" required><br><br>`;
    } else if (type === 'sms') {
        fieldsHtml += `<label>Услуга</label><br><select name="service_id" required></select><br><br>`;
        fieldsHtml += `<label>Время отправки</label><br><input type="datetime-local" name="send_time" required><br><br>`;
        fieldsHtml += `<label>Роуминг</label><br><input type="checkbox" name="is_roaming"><br><br>`;
        fieldsHtml += `<label>Стоимость</label><br><input type="number" step="0.01" name="cost" required><br><br>`;
    } else if (type === 'payment') {
        fieldsHtml += `<label>Дата платежа</label><br><input type="date" name="payment_date" required><br><br>`;
        fieldsHtml += `<label>Сумма</label><br><input type="number" step="0.01" name="amount" required><br><br>`;
        fieldsHtml += `<label>Способ оплаты</label><br><select name="method_id" required></select><br><br>`;
    }

    document.getElementById('dynamic-fields').innerHTML = fieldsHtml;
    document.getElementById('save-btn').style.display = type ? 'inline-block' : 'none';

    if (type === 'call' || type === 'internet' || type === 'sms') {
        api('?action=list&table=services').then(services => {
            const select = document.querySelector('select[name="service_id"]');
            if (select) {
                select.innerHTML = '<option value="">— Выберите услугу —</option>';
                services.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.service_id;
                    opt.textContent = s.name;
                    select.appendChild(opt);
                });
            }
        });
    }
    if (type === 'payment') {
        api('?action=list&table=payment_methods').then(methods => {
            const select = document.querySelector('select[name="method_id"]');
            if (select) {
                select.innerHTML = '<option value="">— Выберите способ —</option>';
                methods.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.method_id;
                    opt.textContent = m.name;
                    select.appendChild(opt);
                });
            }
        });
    }
}

async function saveUnifiedRecord(subscriber_id) {
    const type = document.getElementById('record-type').value;
    let table = '';
    if (type === 'call') table = 'calls';
    else if (type === 'internet') table = 'internet_sessions';
    else if (type === 'sms') table = 'sms';
    else if (type === 'payment') table = 'payments';

    const form = document.getElementById('crud-form');
    const data = {};
    new FormData(form).forEach((value, key) => {
        if (value !== '' && value !== 'off') {
            if (value === 'on') data[key] = true;
            else data[key] = value.trim();
        }
    });

    const result = await api('?action=create&table=' + table, {
        method: 'POST',
        body: JSON.stringify(data)
    });

    if (result.error) {
        alert('Ошибка: ' + result.error);
    } else {
        alert('Запись успешно добавлена!');
        loadSubscriberDetail(subscriber_id);
    }
}

function showChildAddForm(table, subscriber_id, fields) {
    let html = `<h2>Добавление записи в ${formatTitle(table)}</h2><form id="crud-form">`;

    fields.forEach(f => {
        if (f === 'service_id') {
            // Выпадающий список услуг
            html += `<label>${formatLabel(f)}</label><br><select name="service_id" required></select><br><br>`;
        } else if (f === 'method_id') {
            // Выпадающий список способов оплаты
            html += `<label>${formatLabel(f)}</label><br><select name="method_id" required></select><br><br>`;
        } else if (f === 'roaming' || f === 'is_roaming') {
            // Чекбокс для роуминга
            html += `<label>${formatLabel(f)}</label><br><input type="checkbox" name="${f}"><br><br>`;
        } else {
            html += `<label>${formatLabel(f)}</label><br><input type="text" name="${f}" required><br><br>`;
        }
    });

    html += `<input type="hidden" name="subscriber_id" value="${subscriber_id}">`;

    html += `<button type="button" onclick="saveChildRecord('${table}', ${subscriber_id})">Сохранить</button>
             <button type="button" onclick="loadSubscriberDetail(${subscriber_id})">Отмена</button></form>`;

    document.getElementById('content').innerHTML = html;

    // Заполняем выпадающие списки
    if (fields.includes('service_id')) {
        api('?action=list&table=services').then(services => {
            const select = document.querySelector('select[name="service_id"]');
            select.innerHTML = '<option value="">— Выберите услугу —</option>';
            services.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.service_id;
                opt.textContent = s.name;
                select.appendChild(opt);
            });
        });
    }
    if (fields.includes('method_id')) {
        api('?action=list&table=payment_methods').then(methods => {
            const select = document.querySelector('select[name="method_id"]');
            select.innerHTML = '<option value="">— Выберите способ оплаты —</option>';
            methods.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.method_id;
                opt.textContent = m.name;
                select.appendChild(opt);
            });
        });
    }
}


async function loadReports() {
    let html = '<h2>Экранные отчёты</h2>';
    
    html += '<button onclick="runReport(\'top_debtors\', \'Топ-10 должников\')">Топ-10 должников</button><br><br>';
    
    html += '<button onclick="runReport(\'revenue_by_month\', \'Выручка по месяцам (2025)\')">Выручка по месяцам</button><br><br>';
    
    html += '<button onclick="runReport(\'top_cities\', \'Топ-10 городов по выручке\')">Топ-10 городов по выручке</button><br><br>';
    
    html += '<button onclick="runReport(\'current_tariff\', \'Текущие тарифы абонентов\')">Текущие тарифы абонентов</button><br><br>';
    
    html += '<h3>Детализация использования услуг абонента</h3>';
    html += '<label>ID абонента:</label> <input type="number" id="det-sub-id" value="1" style="width:100px;"><br><br>';
    html += '<label>Год:</label> <input type="number" id="det-year" value="2025" style="width:100px;"> ';
    html += '<label>Месяц:</label> <input type="number" id="det-month" value="8" min="1" max="12" style="width:100px;"><br><br>';
    html += '<button onclick="runSubscriberUsage()">Показать детализацию</button><br><br>';
    
    html += '<div id="report-result"></div>';
    document.getElementById('content').innerHTML = html;
}

async function runReport(proc, name, sid = null, y = null, m = null) {
    let url = `?action=report&proc=${proc}`;
    if (sid) url += `&subscriber_id=${sid}`;
    if (y) url += `&year=${y}`;
    if (m) url += `&month=${m}`;
    
    const data = await api(url);
    let html = `<h3>${name}</h3>`;
    if (data.length === 0) {
        html += '<p>Нет данных</p>';
    } else {
        html += '<table><tr>';
        Object.keys(data[0]).forEach(k => html += `<th>${formatLabel(k)}</th>`);
        html += '</tr>';
        data.forEach(row => {
            html += '<tr>';
            Object.values(row).forEach(v => html += `<td>${v ?? ''}</td>`);
            html += '</tr>';
        });
        html += '</table>';
    }
    document.getElementById('report-result').innerHTML = html;
}

async function runSubscriberUsage() {
    const sid = document.getElementById('det-sub-id').value;
    const year = document.getElementById('det-year').value;
    const month = document.getElementById('det-month').value.padStart(2, '0');
    
    if (!sid || !year || !month) {
        alert('Заполните все поля');
        return;
    }
    
    const data = await api(`?action=report&proc=subscriber_usage&subscriber_id=${sid}&year=${year}&month=${month}`);
    
    let html = `<h3>Использование услуг абонента ${sid} (${month}.${year})</h3>`;
    if (!data || data.length === 0) {
        html += '<p>Нет данных за этот период</p>';
    } else {
        html += '<table><tr>';
        html += '<th>Название услуги</th><th>Дата использования</th><th>Количество</th><th>Стоимость</th>';
        html += '</tr>';
        data.forEach(row => {
            html += '<tr>';
            html += `<td>${row.service_name || ''}</td>`;
            html += `<td>${row.usage_date || ''}</td>`;
            html += `<td>${row.quantity || ''}</td>`;
            html += `<td>${row.cost ?? ''}</td>`;
            html += '</tr>';
        });
        html += '</table>';
    }
    document.getElementById('report-result').innerHTML = html;
}

function loadSearchForm() {
    let html = `<h2>Поиск абонентов</h2>
        <input type="text" id="search-q" placeholder="Введите ФИО или телефон" style="width:400px;padding:10px;">
        <button onclick="performSearch()">Найти</button>
        <div id="search-results"></div>`;
    document.getElementById('content').innerHTML = html;
}

async function performSearch() {
    const q = document.getElementById('search-q').value;
    const data = await api(`?action=search_subscribers&q=${encodeURIComponent(q)}`);
    let html = '<table><tr><th>ФИО</th><th>Телефон</th><th>Город</th><th>Тариф</th></tr>';
    data.forEach(row => {
        html += `<tr><td>${row.full_name}</td><td>${row.phone_number}</td><td>${row.city}</td><td>${row.tariff}</td></tr>`;
    });
    html += '</table>';
    document.getElementById('search-results').innerHTML = html;
}

function showForm(mode, table, id = null) {
    let fields = [];

    if (table === 'cities') {
        fields = ['name', 'region'];
    } else if (table === 'tariffs') {
        fields = ['name', 'monthly_fee', 'description'];
    } else if (table === 'payment_methods') {
        fields = ['name', 'description'];
    } else if (table === 'services') {
        fields = ['tariff_id', 'name', 'unit', 'unit_price', 'description'];
    } else if (table === 'subscribers') {
        fields = ['full_name', 'phone_number', 'address', 'city_id', 'tariff_id'];
    }

    currentFields = fields;
    let html = `<h2>${mode === 'create' ? 'Добавление' : 'Редактирование'} в ${formatTitle(table)}</h2><form id="crud-form">`;
        fields.forEach(f => {
        if (f === 'city_id' && table === 'subscribers') {
            html += `
                <label>${formatLabel(f)}</label><br>
                <select name="city_id" required></select><br><br>
            `;
        } else if (f === 'tariff_id' && table === 'subscribers') {
            html += `
                <label>${formatLabel(f)}</label><br>
                <select name="tariff_id" required></select><br><br>
            `;
        } else if (f === 'tariff_id' && table === 'services') {
            html += `
                <label>${formatLabel(f)}</label><br>
                <select name="tariff_id" required></select><br><br>
            `;
        } else {
            html += `
                <label>${formatLabel(f)}</label><br>
                <input type="text" name="${f}" required><br><br>
            `;
        }
    });


    html += `<button type="button" onclick="saveRecord('${mode}', '${table}', ${id || 'null'})">Сохранить</button>
             <button type="button" onclick="loadDirectory('${table}', '${formatTitle(table)}', currentFields)">Отмена</button></form>`;
    document.getElementById('content').innerHTML = html;
    if (table === 'subscribers' && fields.includes('city_id')) {
        api('?action=list&table=cities').then(cities => {
            const select = document.querySelector('select[name="city_id"]');
            select.innerHTML = '<option value="">— Выберите город —</option>';
            cities.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.city_id;
                opt.textContent = c.name;
                select.appendChild(opt);
            });
        });
    }
    if (table === 'subscribers' && fields.includes('tariff_id')) {
        api('?action=list&table=tariffs').then(tariffs => {
            const select = document.querySelector('select[name="tariff_id"]');
            select.innerHTML = '<option value="">— Выберите тариф —</option>';
            tariffs.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.tariff_id;
                opt.textContent = `${t.name} (${t.monthly_fee} ₽/мес)`;
                select.appendChild(opt);
            });
        });
    }

    if (table === 'services' && fields.includes('tariff_id')) {
        api('?action=list&table=tariffs').then(tariffs => {
            const select = document.querySelector('select[name="tariff_id"]');
            select.innerHTML = '<option value="">— Выберите тариф —</option>';
            tariffs.forEach(t => {
                const option = document.createElement('option');
                option.value = t.tariff_id;
                option.textContent = `${t.name} (${t.monthly_fee} ₽/мес)`;
                select.appendChild(option);
            });
        });
    }

    if (mode === 'update' && id) {
        api(`?action=get&table=${table}&id=${id}`).then(data => {
            fields.forEach(f => {
                const input = document.querySelector(`input[name="${f}"]`) || document.querySelector(`select[name="${f}"]`);
                if (input) {
                    if (f === 'tariff_id' && table === 'services') {
                        input.value = data[f] ?? '';
                    } else {
                        input.value = data[f] ?? '';
                    }
                }
            });
        });
    }
}

async function saveRecord(mode, table, id = null) {
    if (mode === 'update' && (id === null || id === 'null')) {
        alert('Ошибка: ID записи не передан');
        return;
    }

    const form = document.getElementById('crud-form');
    const data = {};
    new FormData(form).forEach((v, k) => {
        if (v.trim() !== '') data[k] = v.trim();
    });

    const url = mode === 'update' ? `?action=update&table=${table}&id=${id}` : `?action=create&table=${table}`;
    const method = mode === 'update' ? 'PUT' : 'POST';
    
    const result = await api(url, {method, body: JSON.stringify(data)});
    
    if (result.error) {
        alert('Ошибка: ' + result.error);
    } else {
        alert('Сохранено успешно!');
        loadDirectory(table, formatTitle(table), currentFields);
    }
}

async function deleteRecord(table, pk) {
    if (confirm('Вы уверены, что хотите удалить эту запись? Это действие нельзя отменить.')) {
        const result = await api(`?action=delete&table=${table}&id=${pk}`, {method: 'DELETE'});
        
        if (result.success) {
            alert('Запись успешно удалена!');
        } else {
            alert(result.error || 'Ошибка при удалении');
        }
        
        const fields = currentFields.length > 0 ? currentFields : ['name'];
        loadDirectory(table, formatTitle(table), fields);
    }
}

function formatLabel(field) {
    const map = {
        subscriber_id: 'Абонент ID',
        full_name: 'ФИО',
        phone_number: 'Номер телефона',
        city_id: 'Город',
        tariff_id: 'Тариф',
        name: 'Название',
        monthly_fee: 'Абонентская плата',
        description: 'Описание',
        region: 'Регион',
        unit: 'Единица',
        tariff_name: 'Название тарифа',
        month: "Месяц",
        revenue:"Выручка",
        debt: "Долг",
        unit_price: 'Цена за единицу',
        city_name: 'Город',
        total_revenue: 'Общая выручка',
        address: 'Адрес',
        call_date: 'Дата звонка',
        duration_sec: 'Длительность (сек)',
        roaming: 'Роуминг',
        cost: 'Стоимость',
        start_time: 'Начало сессии',
        end_time: 'Конец сессии',
        data_used_mb: 'Трафик (МБ)',
        send_time: 'Время отправки',
        is_roaming: 'Роуминг',
        payment_date: 'Дата платежа',
        amount: 'Сумма',
        method_id: 'Способ оплаты'
    };
    return map[field] || field.replace(/_/g, ' ').charAt(0).toUpperCase() + field.slice(1);
}

function formatTitle(table) {
    const map = {
        cities: 'Города', tariffs: 'Тарифы', payment_methods: 'Способы оплаты',
        services: 'Услуги', subscribers: 'Абоненты', calls: 'Звонки',
        internet_sessions: 'Интернет-сессии', sms: 'СМС', payments: 'Платежи'
    };
    return map[table] || table;
}

function showSection(section) {
    const map = {
        cities: () => loadDirectory('cities', 'Города', ['name', 'region'], true),
        tariffs: () => loadDirectory('tariffs', 'Тарифы', ['name', 'monthly_fee', 'description'], true),
        'payment-methods': () => loadDirectory('payment_methods', 'Способы оплаты', ['name', 'description']),
        services: () => loadDirectory('services', 'Услуги', ['tariff_id', 'name', 'unit', 'unit_price', 'description']),
        subscribers: () => loadSubscribersMasterDetail(),
        calls: () => loadFullTable('calls', 'Все звонки', ['subscriber_id', 'call_date', 'duration_sec', 'roaming', 'cost']),
        internet: () => loadFullTable('internet_sessions', 'Все интернет-сессии', ['subscriber_id', 'start_time', 'end_time', 'data_used_mb', 'cost']),
        sms: () => loadFullTable('sms', 'Все СМС', ['subscriber_id', 'send_time', 'is_roaming', 'cost']),
        payments: () => loadFullTable('payments', 'Все платежи', ['subscriber_id', 'payment_date', 'amount', 'method_id']),
        reports: () => loadReports(),
        search: () => loadSearchForm()
    };
    if (map[section]) map[section]();
}

async function loadFullTable(table, title, fields) {
    const data = await api(`?action=list&table=${table}`);
    let html = `<h2>${title}</h2>`;
    if (data.length === 0) {
        html += '<p>Нет записей</p>';
    } else {
        html += '<table><tr>';
        fields.forEach(f => html += `<th>${formatLabel(f)}</th>`);
        html += '</tr>';
        data.forEach(row => {
            html += '<tr>';
            fields.forEach(f => html += `<td>${row[f] ?? ''}</td>`);
            html += '</tr>';
        });
        html += '</table>';
    }
    html += '<br><button onclick="showSection(\'subscribers\')">← Назад к абонентам</button>';
    document.getElementById('content').innerHTML = html;
}