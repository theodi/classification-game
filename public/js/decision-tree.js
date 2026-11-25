/* Decision tree functions */
var lockPlayerName = false;
function onchange() {
	saveData();
}

function saveData() {
	storage = {};
	if (window.localStorage.getItem(sessionId)) {
		storage = JSON.parse(window.localStorage.getItem(sessionId));
	}

	var tree = typeof liveGameTree === 'function' ? liveGameTree() : null;
	var factors = tree && tree.factors ? tree.factors : {};
	var boundaries = tree && tree.boundaries ? tree.boundaries : {};
	if (tree && tree.predictions) {
		predictions = Object.assign({}, predictions, tree.predictions);
	}

	try {
		storage.factors = factors;
		storage.boundaries = boundaries;
		storage.predictions = predictions;
		storage.playerName = player_name;
		storage.attempt = attempt;
	} catch(err) {
		console.log("Error saving data");
		console.log(err);
	}

	window.localStorage.setItem(sessionId,JSON.stringify(storage));
}

function sendResult(result) {
    $.ajax({
        url: '/result',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(result),
        dataType: 'json',
        success: function(response) {
            // Handle a successful response here
            console.log('Request successful:', response);
        },
        error: function(xhr, status, error) {
            // Handle errors here
            console.error('Request failed:', status, error);
        }
    });
}

function saveResult() {
	if (resultId || (typeof replayOnly !== 'undefined' && replayOnly)) {
		console.log("Not saving result, view only");
		return null;
	}
	try {
		storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
	} catch (err) {
		storage = storage || {};
	}
	if (!storage.results) {
		storage.results = [];
	}

	var result = {};
	result.playerName = storage.playerName || player_name;
	result.date = new Date().getTime();
	result.id = CryptoJS.MD5(String(result.playerName || 'Team') + result.date).toString();
	result.cardSet = 'group1';
	result.sessionId = sessionId;
	result.evalSetId = (typeof evalSetId === 'undefined') ? null : evalSetId;

	result.tree = {};
	result.tree.factors = storage.factors;
	result.tree.boundaries = storage.boundaries;
	result.tree.predictions = storage.predictions;

	var written = document.getElementById('written-confidence');
	result.writtenConfidence = written && written.value !== '' ? Number(written.value) : null;
	result.confidences = Object.assign({}, confidences);
	result.confidences.written = result.writtenConfidence;
	result.result = results;

	result.score = results.score;
	result.vsHybrid = results.vsHybrid;
	result.vsMachine = results.vsMachine;

	attempt = (attempt || 0) + 1;
	storage.attempt = attempt;
	result.attempt = attempt;

	delete result.result.score;
	delete result.result.vsMachine;
	delete result.result.vsHybrid;

	// Keep a local copy so the in-game session board can show this score
	// even when the teacher-only leaderboard APIs are unavailable.
	storage.results.push(result);
	storage.playerName = result.playerName;
	window.localStorage.setItem(sessionId, JSON.stringify(storage));

	if (isTutor && (typeof entryMode === 'undefined' || !entryMode)) {
		console.log("Not posting result to server, tutor view only");
		return result;
	}
	sendResult(result);
	return result;
}

function changeName() {
	if (!lockPlayerName) {
		player_name = prompt("Team name. Use a team name or first names only.", player_name || "");
		if (!player_name) {
			player_name = "Team";
		}
		$('#playerWelcome').html("Welcome " + player_name);
  		$('#playerWelcome').css("display","inline");
		saveData();
		loadLeaderboards();
	}
}


function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

function processLoad(storage) {
	if (resultId) {
		document.getElementById("confidence-user").innerHTML = storage.confidences.player + "%";
		document.getElementById("confidence-stoopid-ai").innerHTML = storage.confidences.machine + "%";
		document.getElementById("confidence-hybrid").innerHTML = storage.confidences.hybrid + "%";
	}
	try {
		var factors = storage.factors;
		var boundaries = storage.boundaries;
		predictions = storage.predictions;
		player_name = storage.playerName;
		lockPlayerName = storage.lockPlayerName;
		if (lockPlayerName) {
			document.getElementById('changeName').style.display = "none";
		}
		attempt = storage.attempt;
		if (storage.lastEvaluatedTreeFingerprint && typeof lastEvaluatedTreeFingerprint !== 'undefined') {
			lastEvaluatedTreeFingerprint = storage.lastEvaluatedTreeFingerprint;
		}
		if (typeof leaderboardReplayOnly !== 'undefined') {
			leaderboardReplayOnly = !!storage.leaderboardReplayOnly;
		}
		if (storage.playerName == ""){
	      player_name = prompt("Team name. Use a team name or first names only.", "");
	      $('#playerWelcome').html("Welcome " + player_name);
	      $('#playerWelcome').css("display","inline");
	    } else {
	      $('#playerWelcome').html("Welcome " + player_name);
	      $('#playerWelcome').css("display","inline");
	    }

		if (window.gameTree && typeof window.gameTree.fromGameTree === 'function') {
			window.gameTree.fromGameTree({
				factors: factors || {},
				boundaries: boundaries || {},
				predictions: predictions || {}
			});
		}
	} catch (err) {

	}
}

function loadLeaderboardData() {
	var userId = getQueryParam('userId');

	if (userId) {
		lockPlayerName = true;
		if (window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId));
			if (storage.playerName == userId) {
				//Do nothing
			} else {
				storage = {};
				storage.playerName = userId;
				storage.attempt = 0;
				storage.lockPlayerName = true;
				window.localStorage.setItem(sessionId,JSON.stringify(storage));
			}
		} else {
			storage = {};
			storage.playerName = userId;
			storage.attempt = 0;
			storage.lockPlayerName = true;
			window.localStorage.setItem(sessionId,JSON.stringify(storage));
		}
 	}
	if (!window.localStorage.getItem(sessionId) && resultId == "") {
		changeName();
		saveData();
		loadLeaderboards();
		return;
	}
	if (resultId) {
		$('#title').html("ODI Machine learning game (tutor mode)")
		$.getJSON('/result/' + resultId, function(data) {
			storage = data;
			storage.results = [];
			var temp = {};
			temp.id = data.id;
			storage.results.push(temp);
			storage.factors = data.tree.factors;
			storage.boundaries = data.tree.boundaries;
			storage.predictions = data.tree.predictions;
			confidences = data.confidences;
			if (data.evalSetId) {
				evalSetId = data.evalSetId;
			}
			window.localStorage.setItem(sessionId,JSON.stringify(data));
			processLoad(storage);
			loadLeaderboards();
  		});
	} else if (isTutor) {
		$('#title').html("ODI Machine learning game (tutor mode)");
		player_name = '<span style="color:red">Tutor</span>';
		$('#playerWelcome').html("Welcome " + player_name);
  		$('#playerWelcome').css("display","inline");
  		storage = JSON.parse(window.localStorage.getItem(sessionId));
		processLoad(storage);
		loadLeaderboards();
	} else {
		storage = JSON.parse(window.localStorage.getItem(sessionId));
		processLoad(storage);
		loadLeaderboards();
	}
}

var browseDownloadState = {
	indexes: [],
	allowPdf: false,
	sourceSet: null,
	csvObjectUrl: null
};

function setBrowseModalTab(tabId) {
	var id = tabId || 'browse-cards';
	document.querySelectorAll('[data-browse-tab]').forEach(function(btn) {
		var active = btn.getAttribute('data-browse-tab') === id;
		btn.classList.toggle('selected', active);
		btn.setAttribute('aria-selected', active ? 'true' : 'false');
	});
	var frame = document.getElementById('cluster-browse-frame');
	try {
		if (frame && frame.contentWindow && typeof frame.contentWindow.showEmbedTab === 'function') {
			frame.contentWindow.showEmbedTab(id);
		}
	} catch (err) {}
}

function csvEscape(value) {
	var text = value === undefined || value === null ? '' : String(value);
	if (/[",\n\r]/.test(text)) {
		return '"' + text.replace(/"/g, '""') + '"';
	}
	return text;
}

function resolveBrowseCards(indexes) {
	var byIndex = {};
	var sources = [];
	if (browseDownloadState.sourceSet && browseDownloadState.sourceSet.length) {
		sources.push(browseDownloadState.sourceSet);
	}
	if (typeof cards !== 'undefined') {
		sources.push(cards.trainingSet, cards.testSet, cards.evaluationSet);
	}
	sources.forEach(function(set) {
		(set || []).forEach(function(card) {
			if (card && card.index !== undefined && card.index !== null) {
				byIndex[String(card.index)] = card;
			}
		});
	});
	return (indexes || []).map(function(id) {
		return byIndex[String(id)];
	}).filter(Boolean);
}

function buildBrowseCardsCsv(cardList) {
	var features = window.GAME_FEATURES || [];
	var header = ['Card'].concat(features.map(function(feature) {
		return feature.label || feature.column;
	})).concat(['City']);
	var lines = [header.map(csvEscape).join(',')];
	(cardList || []).forEach(function(card) {
		var row = [card.index].concat(features.map(function(feature) {
			return card[feature.column];
		})).concat([card.city || '']);
		lines.push(row.map(csvEscape).join(','));
	});
	return lines.join('\n');
}

function syncBrowseDownloads() {
	var csvLink = document.getElementById('browse-download-csv');
	var pdfLink = document.getElementById('browse-download-pdf');
	var downloadRoot = document.querySelector('.cluster-browse-download');
	if (!csvLink) return;

	var cardList = resolveBrowseCards(browseDownloadState.indexes);
	var csv = buildBrowseCardsCsv(cardList);
	if (browseDownloadState.csvObjectUrl) {
		URL.revokeObjectURL(browseDownloadState.csvObjectUrl);
	}
	browseDownloadState.csvObjectUrl = URL.createObjectURL(new Blob([csv], {
		type: 'text/csv;charset=utf-8'
	}));
	csvLink.href = browseDownloadState.csvObjectUrl;
	csvLink.download = browseDownloadState.allowPdf ? 'cards.csv' : 'cluster-cards.csv';
	csvLink.classList.toggle('is-disabled', !cardList.length);

	if (pdfLink) {
		if (browseDownloadState.allowPdf) {
			pdfLink.removeAttribute('hidden');
			pdfLink.href = '/data/pdfs/Group_1.pdf';
			pdfLink.setAttribute('download', 'cards.pdf');
		} else {
			pdfLink.setAttribute('hidden', '');
			pdfLink.removeAttribute('href');
		}
	}
	if (downloadRoot) {
		downloadRoot.classList.toggle('pdf-available', !!browseDownloadState.allowPdf);
	}
}

function openBrowseModal(indexes, title, options) {
	var opts = options || {};
	var list = (indexes || []).filter(function(n) { return n !== undefined && n !== null && n !== ''; });
	if (!list.length) {
		alert('No cards to browse in this cluster yet.');
		return;
	}
	browseDownloadState.indexes = list.slice();
	browseDownloadState.allowPdf = !!opts.allowPdf;
	browseDownloadState.sourceSet = opts.sourceSet || null;
	syncBrowseDownloads();

	var indexNumbersString = list.join(',');
	var url = '/browse?embed=1&cards=' + encodeURIComponent(indexNumbersString);
	var modal = document.getElementById('cluster-browse-modal');
	var frame = document.getElementById('cluster-browse-frame');
	if (modal && frame && typeof modal.showModal === 'function') {
		setBrowseModalTab('browse-cards');
		frame.onload = function() {
			setBrowseModalTab('browse-cards');
		};
		frame.src = url;
		modal.showModal();
		return;
	}
	window.open('/browse?cards=' + encodeURIComponent(indexNumbersString), '_blank');
}

function indexesFromDropzone(path) {
	var box = document.getElementById('box_' + path);
	var ids = [];
	if (box) {
		box.querySelectorAll('card').forEach(function(el) {
			var id = el.id || '';
			var match = id.match(/^b(\d+)$/);
			if (match) {
				ids.push(match[1]);
			}
		});
	}
	return ids;
}

function browseCluster(cluster, event) {
	if (event && event.preventDefault) {
		event.preventDefault();
	}
	if (typeof currentPlayMode !== 'undefined' && currentPlayMode === 'test') {
		return;
	}
	if (typeof assignBoxes === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		assignBoxes(cards.trainingSet);
	}
	var set = (typeof cards !== 'undefined' && cards.trainingSet) ? cards.trainingSet : [];
	var fromDom = indexesFromDropzone(cluster);
	var fromModel = set.filter(function(item) { return item.box === cluster; }).map(function(item) {
		return item.index;
	});
	var seen = {};
	var merged = [];
	fromDom.concat(fromModel).forEach(function(id) {
		var key = String(id);
		if (!seen[key]) {
			seen[key] = true;
			merged.push(id);
		}
	});
	openBrowseModal(merged, 'Browse cluster', {
		allowPdf: false,
		sourceSet: set
	});
}

function browseAllCards(event) {
	if (event && event.preventDefault) {
		event.preventDefault();
	}
	if (typeof currentPlayMode !== 'undefined' && currentPlayMode === 'test') {
		return;
	}
	var cfg = (typeof activeDeckConfig === 'function') ? activeDeckConfig() : {
		set: (typeof cards !== 'undefined' && cards.trainingSet) ? cards.trainingSet : [],
		boxId: 'training-set',
		color: 'b'
	};
	var set = cfg.set || [];
	var indexes = set.map(function(item) { return item.index; });
	if (!indexes.length) {
		var deck = document.getElementById(cfg.boxId || 'training-set');
		if (deck) {
			var prefix = cfg.color || 'b';
			var re = new RegExp('^' + prefix + '(\\d+)$');
			deck.querySelectorAll('card').forEach(function(el) {
				var match = (el.id || '').match(re);
				if (match) {
					indexes.push(match[1]);
				}
			});
		}
	}
	openBrowseModal(indexes, 'Browse cards', {
		allowPdf: true,
		sourceSet: set
	});
}

function closeClusterBrowse() {
	var modal = document.getElementById('cluster-browse-modal');
	var frame = document.getElementById('cluster-browse-frame');
	if (modal && modal.open) {
		modal.close();
	}
	if (frame) {
		frame.src = 'about:blank';
	}
	document.querySelectorAll('.cluster-browse-download-menu').forEach(function(menu) {
		menu.setAttribute('hidden', '');
	});
	document.querySelectorAll('[data-browse-download-toggle]').forEach(function(btn) {
		btn.setAttribute('aria-expanded', 'false');
	});
	if (browseDownloadState.csvObjectUrl) {
		URL.revokeObjectURL(browseDownloadState.csvObjectUrl);
		browseDownloadState.csvObjectUrl = null;
	}
}

document.addEventListener('click', function(event) {
	if (event.target.closest('[data-bring-cards-back]')) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		var cfg = (typeof activeDeckConfig === 'function') ? activeDeckConfig() : null;
		if (cfg && typeof returnCards === 'function' && cfg.set) {
			returnCards(cfg.set, cfg.boxId, cfg.color);
		}
		if (typeof hideRunSummaryPanel === 'function') {
			hideRunSummaryPanel();
		}
		return;
	}
	var summaryView = event.target.closest('[data-summary-view]');
	if (summaryView) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		if (typeof setRunSummaryView === 'function') {
			setRunSummaryView(summaryView.getAttribute('data-summary-view'));
		}
		return;
	}
	if (event.target.closest('[data-run-test]')) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		if (typeof startGuidedTest === 'function') {
			startGuidedTest();
		}
		return;
	}
	if (event.target.closest('[data-enter-evaluation]')) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		if (typeof setPlayMode === 'function') {
			setPlayMode('evaluation');
		}
		return;
	}
	if (event.target.closest('[data-back-to-training]')) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		if (typeof setPlayMode === 'function') {
			setPlayMode('training', { force: true });
		}
		if (typeof returnCardsInstant === 'function' && typeof cards !== 'undefined') {
			returnCardsInstant(cards.trainingSet, 'training-set', 'b');
			returnCardsInstant(cards.testSet, 'test-set', 'p');
		}
		if (typeof hideRunSummaryPanel === 'function') {
			hideRunSummaryPanel();
		}
		return;
	}
	if (event.target.closest('[data-browse-all-cards]')) {
		browseAllCards(event);
		return;
	}
	var browse = event.target.closest('[data-browse-cluster]');
	if (browse) {
		browseCluster(browse.getAttribute('data-browse-cluster') || '', event);
		return;
	}
	var browseTab = event.target.closest('[data-browse-tab]');
	if (browseTab) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		setBrowseModalTab(browseTab.getAttribute('data-browse-tab'));
		return;
	}
	var downloadToggle = event.target.closest('[data-browse-download-toggle]');
	if (downloadToggle) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		syncBrowseDownloads();
		var menu = downloadToggle.parentNode && downloadToggle.parentNode.querySelector('.cluster-browse-download-menu');
		if (menu) {
			var open = menu.hasAttribute('hidden');
			if (open) {
				menu.removeAttribute('hidden');
			} else {
				menu.setAttribute('hidden', '');
			}
			downloadToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		}
		return;
	}
	if (event.target.closest('#browse-download-csv.is-disabled')) {
		if (event.preventDefault) {
			event.preventDefault();
		}
		return;
	}
	var downloadRoot = event.target.closest('.cluster-browse-download');
	if (!downloadRoot) {
		document.querySelectorAll('.cluster-browse-download-menu').forEach(function(menu) {
			menu.setAttribute('hidden', '');
		});
		document.querySelectorAll('[data-browse-download-toggle]').forEach(function(btn) {
			btn.setAttribute('aria-expanded', 'false');
		});
	}
	if (event.target.closest('[data-cluster-browse-close]')) {
		closeClusterBrowse();
	}
});

function updatePredictions() {
	if (typeof liveGameTree === 'function') {
		var tree = liveGameTree();
		predictions = Object.assign({}, predictions, tree.predictions || {});
	}
	if (typeof cards !== 'undefined' && cards.trainingSet) {
		updateConfidence(cards.trainingSet);
	}
	saveData();
}
function addBranch(branch) {
	$('.'+branch).show();
	$('.'+branch+'_invert').hide();
}

function renderLeaderboard(data, prefix) {
  resultsCount = data.length;
  var rows = (data || []).slice().sort(function(a, b) {
    return Number(b.score) - Number(a.score);
  });

  if (prefix === 'session') {
    var sessionBody = document.getElementById('session-leaderboard-body');
    if (!sessionBody) return;
    sessionBody.innerHTML = '';
    var pendingName = (typeof sessionPendingTeam !== 'undefined' && sessionPendingTeam && sessionPendingTeam.name)
      ? String(sessionPendingTeam.name).trim().toLowerCase()
      : '';
    var pendingMatched = false;
    rows.forEach(function(item) {
      indexSessionLeaderboardResult(item);
      try {
        for (var j = 0; j < storage.results.length; j++) {
          if (storage.results[j].id == item.id) {
            indexSessionLeaderboardResult(storage.results[j]);
            if (!item.tree && storage.results[j].tree) {
              item = Object.assign({}, item, { tree: storage.results[j].tree, confidences: storage.results[j].confidences || item.confidences });
              indexSessionLeaderboardResult(item);
            }
            item.playerName = item.playerName || storage.playerName;
          }
        }
      } catch (err) {}
      var userClass = '';
      try {
        for (var k = 0; k < storage.results.length; k++) {
          if (storage.results[k].id == item.id) {
            userClass = 'user';
          }
        }
      } catch (err2) {}
      var name = item.playerName
        ? ((isTutor || prefix === 'session') ? item.playerName : item.playerName.substring(0, 16))
        : String(item.id || '').substring(0, 10);
      if (pendingName && String(name).trim().toLowerCase() === pendingName) {
        pendingMatched = true;
      }
      var attemptLabel = item.attempt !== undefined && item.attempt !== null ? item.attempt : '';
      var label = name + (attemptLabel !== '' ? ' (' + attemptLabel + ')' : '');
      var tr = document.createElement('tr');
      if (userClass) tr.className = userClass;
      if (item.id) {
        tr.setAttribute('data-result-id', String(item.id));
      }
      var indexed = item.id ? sessionLeaderboardById[item.id] : null;
      if (indexed && indexed.tree) {
        tr.classList.add('is-loadable');
        tr.title = 'Click to load this tree and replay evaluation';
        tr.setAttribute('tabindex', '0');
        tr.setAttribute('role', 'button');
      }
      tr.innerHTML = '<td>' + label + '</td><td>' + item.score + '</td>';
      sessionBody.appendChild(tr);
    });
    if (pendingName && !pendingMatched && typeof sessionPendingTeam !== 'undefined' && sessionPendingTeam) {
      appendSessionPendingLeaderboardRow(sessionBody, sessionPendingTeam);
    }
    return;
  }

  var rank = 0;
  var currentScore = null;
  for (var i = 0; i < rows.length; i++) {
    var userClass = '';
    if (rows[i].score != currentScore) {
      currentScore = rows[i].score;
      rank = rank + 1;
    }
    try {
      for (var j = 0; j < storage.results.length; j++) {
        if (storage.results[j].id == rows[i].id) {
          userClass = 'user';
          rows[i].playerName = storage.playerName;
        }
      }
    } catch (err) {}
    if (rows[i].playerName) {
      var displayName = rows[i].playerName.substring(0, 16);
      if (isTutor) {
        displayName = rows[i].playerName;
      }
      $('#' + prefix + '-leaderboard-body').append(
        '<tr class="' + userClass + '"><td>' + rank + '</td><td>' + rows[i].attempt + '</td><td>' + displayName + '</td><td>' + rows[i].score + '</td></tr>'
      );
    } else {
      $('#' + prefix + '-leaderboard-body').append(
        '<tr class="' + userClass + '"><td>' + rank + '</td><td>' + rows[i].attempt + '</td><td>' + String(rows[i].id).substring(0, 10) + '</td><td>' + rows[i].score + '</td></tr>'
      );
    }
  }
  var $table = $('#' + prefix + '-leaderboard');
  if ($.fn.dataTable && $.fn.dataTable.isDataTable($table)) {
    $table.DataTable().clear().destroy();
  }
  $table.DataTable({
    dom: '<"dt-top"f>rt<"dt-bottom"<"dt-length"l><"dt-info"i><"dt-paginate"p>>',
    retrieve: true,
    destroy: true
  });
}

function appendSessionPendingLeaderboardRow(sessionBody, pending) {
	if (!sessionBody || !pending || !pending.name) return;
	var existing = sessionBody.querySelector('[data-pending-team="1"]');
	if (existing) {
		existing.remove();
	}
	var attemptLabel = pending.attempt !== undefined && pending.attempt !== null ? pending.attempt : '';
	var label = pending.name + (attemptLabel !== '' ? ' (' + attemptLabel + ')' : '');
	var tr = document.createElement('tr');
	tr.className = 'user is-pending-score';
	tr.setAttribute('data-pending-team', '1');
	tr.innerHTML = '<td>' + label + '</td><td>???</td>';
	sessionBody.insertBefore(tr, sessionBody.firstChild);
}

function renderSessionLeaderboardPending() {
	var sessionBody = document.getElementById('session-leaderboard-body');
	if (!sessionBody) return;
	if (typeof sessionPendingTeam === 'undefined' || !sessionPendingTeam || !sessionPendingTeam.name) {
		var stale = sessionBody.querySelector('[data-pending-team="1"]');
		if (stale) stale.remove();
		return;
	}
	var pendingName = String(sessionPendingTeam.name).trim().toLowerCase();
	var hasReal = false;
	sessionBody.querySelectorAll('tr').forEach(function(row) {
		if (row.getAttribute('data-pending-team') === '1') return;
		var cell = row.querySelector('td');
		if (!cell) return;
		var text = cell.textContent || '';
		var nameOnly = text.replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
		if (nameOnly === pendingName) {
			hasReal = true;
		}
	});
	if (hasReal) {
		var old = sessionBody.querySelector('[data-pending-team="1"]');
		if (old) old.remove();
		return;
	}
	appendSessionPendingLeaderboardRow(sessionBody, sessionPendingTeam);
}

function destroyLeaderboardDataTable(prefix) {
	var $table = $('#' + prefix + '-leaderboard');
	if (!$table.length || !$.fn.dataTable || !$.fn.dataTable.isDataTable($table)) {
		return;
	}
	try {
		$table.DataTable().clear().destroy();
	} catch (err) {}
}

var sessionLeaderboardById = {};

function indexSessionLeaderboardResult(item) {
	if (!item || !item.id) return;
	var existing = sessionLeaderboardById[item.id];
	if (!existing || (item.tree && !existing.tree)) {
		sessionLeaderboardById[item.id] = item;
	}
}

function findSessionLeaderboardResult(resultId) {
	if (!resultId) return null;
	if (sessionLeaderboardById[resultId]) {
		return sessionLeaderboardById[resultId];
	}
	try {
		var store = storage;
		if ((!store || !store.results) && window.localStorage && sessionId) {
			store = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		var found = null;
		((store && store.results) || []).forEach(function(item) {
			if (item && String(item.id) === String(resultId)) {
				found = item;
			}
		});
		return found;
	} catch (err) {
		return null;
	}
}

function getLocalSessionLeaderboardRows() {
	var rows = [];
	var store = storage;
	try {
		if ((!store || !store.results) && window.localStorage && sessionId) {
			store = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
	} catch (err) {
		store = store || {};
	}
	((store && store.results) || []).forEach(function(item) {
		if (!item) return;
		indexSessionLeaderboardResult(item);
		rows.push(item);
	});
	return rows;
}

function applyLoadedEvaluationResult(result) {
	if (!result || !result.tree) {
		alert('That leaderboard entry does not include a tree to load.');
		return false;
	}
	if (window.gameTree && typeof window.gameTree.fromGameTree === 'function') {
		window.gameTree.fromGameTree({
			factors: result.tree.factors || {},
			boundaries: result.tree.boundaries || {},
			predictions: result.tree.predictions || {}
		});
	}
	predictions = Object.assign({}, result.tree.predictions || {});
	if (result.confidences) {
		confidences = Object.assign({}, confidences || {}, result.confidences);
	}
	if (typeof updateConfidence === 'function' && typeof cards !== 'undefined' && cards.trainingSet) {
		try {
			updateConfidence(cards.trainingSet);
		} catch (err) {}
	}
	if (typeof saveData === 'function') {
		saveData();
	}
	leaderboardReplayOnly = true;
	replayOnly = true;
	try {
		if (typeof storage !== 'object' || !storage) storage = {};
		if (window.localStorage && sessionId && window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		storage.leaderboardReplayOnly = true;
		window.localStorage.setItem(sessionId, JSON.stringify(storage));
	} catch (err) {}
	if (typeof snapshotEvaluatedTree === 'function') {
		snapshotEvaluatedTree();
	}
	if (typeof clearSessionPendingTeam === 'function') {
		clearSessionPendingTeam();
	}
	if (typeof setPlayMode === 'function') {
		setPlayMode('evaluation', { force: true });
	}
	if (typeof setEvalFlowChrome === 'function') {
		setEvalFlowChrome('done');
	}
	if (typeof setEvaluationStatusMessage === 'function') {
		var label = result.playerName || 'this team';
		var attemptLabel = result.attempt !== undefined && result.attempt !== null ? ' (attempt ' + result.attempt + ')' : '';
		setEvaluationStatusMessage('Loaded tree from <strong>' + label + attemptLabel + '</strong>. Replay only — new scores cannot be submitted.');
	}
	if (typeof updateEvalActionButtons === 'function') {
		updateEvalActionButtons();
	}
	return true;
}

function loadSessionLeaderboardResult(resultId) {
	var result = findSessionLeaderboardResult(resultId);
	if (!result) {
		alert('Could not find that leaderboard entry.');
		return;
	}
	if (!result.tree) {
		alert('That leaderboard entry does not include a saved tree.');
		return;
	}
	var label = result.playerName || 'this team';
	var ok = window.confirm(
		'Load the tree from "' + label + '"?\n\n' +
		'This replaces your current tree. You will only be able to replay evaluation for this tree — you cannot submit a new score from a leaderboard load.'
	);
	if (!ok) {
		return;
	}
	applyLoadedEvaluationResult(result);
}

function clearEvaluationProgress() {
	try {
		if (window.localStorage && sessionId && window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		} else {
			storage = storage || {};
		}
	} catch (err) {
		storage = storage || {};
	}
	storage.results = [];
	storage.attempt = 0;
	delete storage.lastEvaluatedTreeFingerprint;
	delete storage.leaderboardReplayOnly;
	try {
		window.localStorage.setItem(sessionId, JSON.stringify(storage));
	} catch (err) {}

	attempt = 0;
	if (typeof lastEvaluatedTreeFingerprint !== 'undefined') {
		lastEvaluatedTreeFingerprint = '';
	}
	leaderboardReplayOnly = false;
	replayOnly = false;
	sessionLeaderboardById = {};
	if (typeof sessionPendingTeam !== 'undefined') {
		sessionPendingTeam = null;
	}
	results = {
		vsMachine: { win: 0, draw: 0, lost: 0 },
		vsHybrid: { win: 0, draw: 0, lost: 0 }
	};
	for (var n = 1; n <= 4; n++) {
		['user', 'stoopid-ai', 'hybrid', 'score'].forEach(function(kind) {
			var el = document.getElementById('result' + n + '-' + kind);
			if (el) el.innerHTML = '';
		});
	}
	['confidence-user', 'confidence-stoopid-ai', 'confidence-hybrid'].forEach(function(id) {
		var el = document.getElementById(id);
		if (el) el.textContent = '';
	});
	if (typeof setEvaluationStatusMessage === 'function') {
		setEvaluationStatusMessage('');
	}
	if (typeof highlightScoreGuide === 'function') {
		var guide = document.getElementById('game-score-guide');
		if (guide) {
			guide.querySelectorAll('.is-active').forEach(function(item) {
				item.classList.remove('is-active');
			});
		}
	}
	if (typeof evalFlowPhase !== 'undefined') {
		evalFlowPhase = 'idle';
	}
	if (typeof renderSessionLeaderboardFromLocal === 'function') {
		renderSessionLeaderboardFromLocal();
	}
	if (typeof currentPlayMode !== 'undefined' && currentPlayMode === 'evaluation' && typeof beginEvaluationFlow === 'function') {
		beginEvaluationFlow();
	}
	if (typeof updateEvalActionButtons === 'function') {
		updateEvalActionButtons();
	}
	return true;
}

function mergeSessionLeaderboardRows(serverRows, localRows) {
	var merged = [];
	var seen = {};
	(serverRows || []).forEach(function(item) {
		if (!item) return;
		var key = String(item.id || '') + '::' + String(item.playerName || '') + '::' + String(item.attempt || '');
		seen[key] = true;
		merged.push(item);
	});
	(localRows || []).forEach(function(item) {
		if (!item) return;
		var key = String(item.id || '') + '::' + String(item.playerName || '') + '::' + String(item.attempt || '');
		if (seen[key]) return;
		// Prefer matching by name+attempt when server assigned a different id shape.
		var nameAttempt = String(item.playerName || '').trim().toLowerCase() + '::' + String(item.attempt || '');
		var already = merged.some(function(row) {
			return String(row.playerName || '').trim().toLowerCase() + '::' + String(row.attempt || '') === nameAttempt;
		});
		if (!already) {
			merged.push(item);
		}
	});
	return merged;
}

function renderSessionLeaderboardFromLocal() {
	renderLeaderboard(getLocalSessionLeaderboardRows(), 'session');
	renderSessionLeaderboardPending();
}

function loadLeaderboards() {
	// Always paint local session scores first (works for students; teacher APIs are auth-gated).
	renderSessionLeaderboardFromLocal();
	if (!leaderboardId) {
		return;
	}
	destroyLeaderboardDataTable('organisation');
	destroyLeaderboardDataTable('public');
	$('#organisation-leaderboard-body').html('');
	$('#public-leaderboard-body').html('');
	$.getJSON('/schools/' + leaderboardId + '/sessions/' + sessionId + '/results')
		.done(function(data) {
			renderLeaderboard(mergeSessionLeaderboardRows(data, getLocalSessionLeaderboardRows()), 'session');
			renderSessionLeaderboardPending();
		})
		.fail(function() {
			renderSessionLeaderboardFromLocal();
		});
	$.getJSON('/schools/' + leaderboardId + '/results', function(data) {
		renderLeaderboard(data, 'organisation');
	});
	$.getJSON('/schools/' + leaderboardId + '/public-results', function(data) {
		renderLeaderboard(data, 'public');
	});
}

function toggleContent(button) {
    var content = button.nextElementSibling;
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        button.textContent = '-';
    } else {
        content.style.display = 'none';
        button.textContent = '+';
    }
}

function sheetFeatureOptions() {
    var html = '<option value="">Choose a feature</option>';
    (window.GAME_FEATURES || []).forEach(function(feature) {
        html += '<option value="' + feature.column + '">' + feature.label + '</option>';
    });
    return html;
}

function renderRecordingSheet() {
    var sheet = document.getElementById('recording-sheet');
    if (!sheet) {
        return;
    }
    sheet.classList.remove('hidden');
    var team = document.getElementById('sheet-team');
    if (team && presetTeam) {
        team.value = presetTeam;
        player_name = presetTeam;
    }
    document.getElementById('sheet-rows').innerHTML = sheetRow('');
    hydrateRecordingSheetFromStorage();
}

function hydrateRecordingSheetFromStorage() {
    if (typeof sessionId === 'undefined' || !sessionId) {
        return;
    }
    var raw = sessionStorage.getItem('entrySheet:' + sessionId);
    if (!raw) {
        return;
    }
    var payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        return;
    }
    sessionStorage.removeItem('entrySheet:' + sessionId);
    if (payload.team) {
        var team = document.getElementById('sheet-team');
        if (team) {
            team.value = payload.team;
        }
        player_name = payload.team;
        $('#playerWelcome').html('Welcome ' + player_name);
        $('#playerWelcome').css('display', 'inline');
    }
    if (payload.writtenConfidence !== undefined && payload.writtenConfidence !== null && payload.writtenConfidence !== '') {
        var confidence = document.getElementById('written-confidence');
        if (confidence) {
            confidence.value = payload.writtenConfidence;
        }
    }
    (payload.rows || []).forEach(function(row) {
        ensureSheetRow(row.position || '');
        var el = document.querySelector('.sheet-row[data-pos="' + (row.position || '') + '"]');
        if (!el) {
            return;
        }
        el.querySelector('.sheet-feature').value = row.feature || '';
        el.querySelector('.sheet-threshold').value = row.threshold || '';
        el.querySelector('.sheet-left').value = row.left || '';
        el.querySelector('.sheet-right').value = row.right || '';
        if (row.left === 'split') {
            ensureSheetRow((row.position || '') + 'l');
        }
        if (row.right === 'split') {
            ensureSheetRow((row.position || '') + 'r');
        }
    });
    if (typeof applyRecordingSheet === 'function') {
        applyRecordingSheet();
    }
}

function sheetRow(position) {
    var title = position === '' ? 'Top split' : 'Next split (' + position + ')';
    var allowSplit = position.length < 2;
    var split = allowSplit ? '<option value="split">Split again</option>' : '';
    return '<fieldset class="sheet-row" data-pos="' + position + '"><legend>' + title + '</legend>' +
        '<label>Split feature <select class="sheet-feature">' + sheetFeatureOptions() + '</select></label> ' +
        '<label>Threshold <input class="sheet-threshold" type="number" step="any"></label> ' +
        '<label>Left prediction <select class="sheet-left"><option value="">Choose</option><option>New York</option><option>San Francisco</option>' + split + '</select></label> ' +
        '<label>Right prediction <select class="sheet-right"><option value="">Choose</option><option>New York</option><option>San Francisco</option>' + split + '</select></label>' +
        '</fieldset>';
}

function ensureSheetRow(position) {
    if (document.querySelector('.sheet-row[data-pos="' + position + '"]')) {
        return;
    }
    document.getElementById('sheet-rows').insertAdjacentHTML('beforeend', sheetRow(position));
}

function applyRecordingSheet() {
    var team = document.getElementById('sheet-team');
    if (team && team.value.trim()) {
        player_name = team.value.trim();
        $('#playerWelcome').html('Welcome ' + player_name);
        $('#playerWelcome').css('display', 'inline');
    }
    document.querySelectorAll('.sheet-row').forEach(function(row) {
        var position = row.getAttribute('data-pos');
        var feature = row.querySelector('.sheet-feature').value;
        var threshold = row.querySelector('.sheet-threshold').value;
        $('#factor_' + position).val(feature);
        $('#condition_' + position + 'a').val(threshold);
        $('#condition_' + position + 'b').val(threshold);
        applySheetSide(position, 'l', row.querySelector('.sheet-left').value);
        applySheetSide(position, 'r', row.querySelector('.sheet-right').value);
    });
    if (typeof onchange === 'function') {
        onchange();
    }
    assignBoxes(cards.trainingSet);
    getPredictions(cards.trainingSet, true);
}

function applySheetSide(position, side, value) {
    var child = position + side;
    if (value === 'split') {
        addBranch('decision_' + child);
        ensureSheetRow(child);
        return;
    }
    var deeper = document.querySelector('.sheet-row[data-pos="' + child + '"]');
    if (deeper) {
        deeper.remove();
    }
    var factor = document.getElementById('factor_' + child);
    if (factor) {
        factor.value = '';
    }
    if (!predictions[child]) {
        predictions[child] = { 'New York': 0, 'San Francisco': 0 };
    }
    predictions[child].prediction = value || '?';
    setElementToOption('prediction_box_' + child, value || '?');
}