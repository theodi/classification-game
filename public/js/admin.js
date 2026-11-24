function jsonFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});
  return fetch(url, options).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        throw new Error(body.error || 'Request failed');
      }
      return body;
    });
  });
}

function message(text) {
  document.getElementById('admin-message').textContent = text;
}

function loadAdmin() {
  jsonFetch('/account-requests').then(function(rows) {
    var body = document.querySelector('#requests tbody');
    body.innerHTML = '';
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.email + '</td><td>' + row.requestedType + '</td><td>' + (row.note || '') + '</td><td></td>';
      var cell = tr.lastChild;
      var approve = document.createElement('button');
      approve.textContent = 'Approve as ' + row.requestedType;
      approve.addEventListener('click', function() {
        jsonFetch('/account-requests/' + row.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'approve', type: row.requestedType })
        }).then(loadAdmin).catch(function(error) { message(error.message); });
      });
      var reject = document.createElement('button');
      reject.textContent = 'Reject';
      reject.addEventListener('click', function() {
        jsonFetch('/account-requests/' + row.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'reject' })
        }).then(loadAdmin).catch(function(error) { message(error.message); });
      });
      cell.appendChild(approve);
      cell.appendChild(reject);
      body.appendChild(tr);
    });
    initAdminTable('#requests', { order: [[0, 'asc']], columnDefs: [{ orderable: false, targets: 3 }] });
  }).catch(function(error) { message(error.message); });

  jsonFetch('/accounts').then(function(rows) {
    var body = document.querySelector('#accounts tbody');
    body.innerHTML = '';
    rows.forEach(function(row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.email + '</td><td><select class="type"></select></td><td><select class="status"></select></td><td class="school"></td><td><button class="save">Save</button></td>';
      var type = tr.querySelector('.type');
      ['selfpaced', 'teacher', 'admin'].forEach(function(value) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (value === row.type) option.selected = true;
        type.appendChild(option);
      });
      var status = tr.querySelector('.status');
      ['pending', 'active', 'disabled'].forEach(function(value) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (value === row.status) option.selected = true;
        status.appendChild(option);
      });
      tr.querySelector('.school').textContent = row.schoolId || '—';
      tr.querySelector('.save').addEventListener('click', function() {
        jsonFetch('/accounts/' + row.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: type.value, status: status.value })
        }).then(function() { message('Saved ' + row.email); }).catch(function(error) { message(error.message); });
      });
      body.appendChild(tr);
    });
    initAdminTable('#accounts', {
      order: [[0, 'asc']],
      columnDefs: [{ orderable: false, targets: [1, 2, 4] }]
    });
  }).catch(function(error) { message(error.message); });
}

loadAdmin();
