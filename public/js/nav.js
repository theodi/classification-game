var chartRendered = false;
var currentPlayMode = 'training';
var evalFlowPhase = 'idle'; // idle | team | tutorial | ready | running | done
var sessionPendingTeam = null; // local-only leaderboard placeholder { name, attempt }
var evalTutorialTimer = null;
var evalTutorialIndex = -1;
var evalTutorialActive = false;
var evalTutorialResumePhase = 'ready';
var lastEvaluatedTreeFingerprint = '';
var leaderboardReplayOnly = false;
var EVAL_TUTORIAL_FADE_MS = 320;
var EVAL_TUTORIAL_GAP_MS = 180;
var gameMessageResolver = null;

function ensureGameMessageDialog() {
	return document.getElementById('game-message-dialog');
}

function closeGameMessageDialog(result) {
	var dialog = ensureGameMessageDialog();
	var resolve = gameMessageResolver;
	gameMessageResolver = null;
	if (dialog && dialog.open) {
		try {
			dialog.close();
		} catch (err) {}
	}
	if (typeof resolve === 'function') {
		resolve(!!result);
	}
}

function showGameMessageDialog(options) {
	options = options || {};
	var dialog = ensureGameMessageDialog();
	if (!dialog) {
		if (options.showCancel) {
			return Promise.resolve(window.confirm(options.message || ''));
		}
		window.alert(options.message || '');
		return Promise.resolve(true);
	}
	if (gameMessageResolver) {
		closeGameMessageDialog(false);
	}
	var title = dialog.querySelector('#game-message-title');
	var body = dialog.querySelector('#game-message-body');
	var confirmBtn = dialog.querySelector('[data-game-message-confirm]');
	var cancelBtn = dialog.querySelector('[data-game-message-cancel]');
	if (title) {
		title.textContent = options.title || (options.showCancel ? 'Please confirm' : 'Notice');
	}
	if (body) {
		body.textContent = options.message || '';
	}
	if (confirmBtn) {
		confirmBtn.textContent = options.confirmLabel || (options.showCancel ? 'Continue' : 'OK');
	}
	if (cancelBtn) {
		cancelBtn.textContent = options.cancelLabel || 'Cancel';
	}
	dialog.classList.toggle('is-alert', !options.showCancel);
	return new Promise(function(resolve) {
		gameMessageResolver = resolve;
		try {
			dialog.showModal();
		} catch (err) {
			gameMessageResolver = null;
			if (options.showCancel) {
				resolve(window.confirm(options.message || ''));
			} else {
				window.alert(options.message || '');
				resolve(true);
			}
		}
	});
}

function gameAlert(message, options) {
	options = options || {};
	return showGameMessageDialog({
		title: options.title || 'Notice',
		message: message,
		confirmLabel: options.confirmLabel || 'OK',
		showCancel: false
	});
}

function gameConfirm(message, options) {
	options = options || {};
	return showGameMessageDialog({
		title: options.title || 'Please confirm',
		message: message,
		confirmLabel: options.confirmLabel || 'Continue',
		cancelLabel: options.cancelLabel || 'Cancel',
		showCancel: true
	});
}

window.gameAlert = gameAlert;
window.gameConfirm = gameConfirm;
window.closeGameMessageDialog = closeGameMessageDialog;

document.addEventListener('click', function(event) {
	if (event.target.closest('[data-game-message-confirm]')) {
		if (event.preventDefault) event.preventDefault();
		closeGameMessageDialog(true);
		return;
	}
	if (event.target.closest('[data-game-message-cancel]')) {
		if (event.preventDefault) event.preventDefault();
		closeGameMessageDialog(false);
	}
});

document.addEventListener('cancel', function(event) {
	if (event.target && event.target.id === 'game-message-dialog') {
		event.preventDefault();
		closeGameMessageDialog(false);
	}
});

function canEnterPlayMode(mode) {
	if (mode === 'training') {
		return true;
	}
	if (typeof ensureLeafPredictionsForEval === 'function') {
		var finalizeError = ensureLeafPredictionsForEval(cards.trainingSet);
		if (finalizeError) {
			gameAlert(finalizeError);
			return false;
		}
	} else if (typeof predictionsComplete === 'function' && !predictionsComplete(cards.trainingSet)) {
		gameAlert('You must ensure you have a valid prediction (not ?) for all branch ends in your tree before you can continue.');
		return false;
	}
	if (!modelHasRun && !confidences.player && confidences.player !== 0) {
		gameAlert('You must run your model on the training set before you can proceed to test or evaluation.');
		return false;
	}
	if (mode === 'evaluation' && requireEvaluationPin) {
		var userInput = prompt('Enter the evaluation pin. Your session ID is ' + randomPin + '.');
		if (!(/^\d{4}$/.test(userInput) && userInput === requiredPasscode)) {
			return false;
		}
	}
	return true;
}

function getEvalTeamName() {
	var input = document.getElementById('eval-team-name');
	var fromInput = input && input.value ? input.value.trim() : '';
	if (fromInput) {
		return fromInput;
	}
	if (typeof player_name === 'string' && player_name.trim() && player_name.trim() !== 'Team') {
		return player_name.trim();
	}
	return '';
}

function setEvalTeamName(name) {
	var cleaned = String(name || '').trim();
	if (!cleaned) {
		return false;
	}
	player_name = cleaned;
	var input = document.getElementById('eval-team-name');
	if (input) {
		input.value = cleaned;
	}
	try {
		if (typeof storage === 'undefined' || !storage) {
			storage = {};
		}
		if (window.localStorage && sessionId && window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		storage.playerName = cleaned;
		if (typeof saveData === 'function') {
			saveData();
		} else if (window.localStorage && sessionId) {
			window.localStorage.setItem(sessionId, JSON.stringify(storage));
		}
	} catch (err) {}
	var welcome = document.getElementById('playerWelcome');
	if (welcome) {
		welcome.textContent = 'Welcome ' + cleaned;
		welcome.style.display = 'inline';
	}
	return true;
}

function showEvalFlowStep(step) {
	document.querySelectorAll('[data-eval-step]').forEach(function(el) {
		el.classList.toggle('hidden', el.getAttribute('data-eval-step') !== step);
	});
}

function setEvalResultsPending(pending) {
	var results = document.getElementById('game-eval-results');
	if (results) {
		results.classList.toggle('is-pending', !!pending);
	}
}

function stopEvalTutorialTimer() {
	if (evalTutorialTimer) {
		clearTimeout(evalTutorialTimer);
		evalTutorialTimer = null;
	}
}

function clearEvalTutorialPulses() {
	document.querySelectorAll('.is-eval-pulse').forEach(function(el) {
		el.classList.remove('is-eval-pulse');
	});
}

function resetEvalTutorialTable(options) {
	options = options || {};
	clearEvalTutorialPulses();
	document.querySelectorAll('[data-eval-reveal]').forEach(function(el) {
		el.classList.remove('is-revealed');
	});
	if (!options.keepConfidences) {
		['confidence-user', 'confidence-stoopid-ai', 'confidence-hybrid'].forEach(function(id) {
			var el = document.getElementById(id);
			if (el) el.textContent = '';
		});
	}
	if (options.clearRunCells !== false) {
		for (var n = 1; n <= 4; n++) {
			['user', 'stoopid-ai', 'hybrid', 'score'].forEach(function(kind) {
				var el = document.getElementById('result' + n + '-' + kind);
				if (el) el.innerHTML = '';
			});
		}
	}
}

function revealEvalParts(keys) {
	(keys || []).forEach(function(key) {
		document.querySelectorAll('[data-eval-reveal="' + key + '"]').forEach(function(el) {
			el.classList.add('is-revealed');
		});
	});
}

function pulseEvalParts(keys) {
	clearEvalTutorialPulses();
	(keys || []).forEach(function(key) {
		document.querySelectorAll('[data-eval-pulse="' + key + '"]').forEach(function(el) {
			el.classList.add('is-eval-pulse');
		});
	});
}

function hasEvalRunResults() {
	return !!(typeof results !== 'undefined' && results && results[1] && (results[1].player || results[1].player === 0));
}

function currentEvalTreeFingerprint() {
	var tree = typeof liveGameTree === 'function' ? liveGameTree() : null;
	var payload = {
		factors: (tree && tree.factors) || {},
		boundaries: (tree && tree.boundaries) || {},
		predictions: (tree && tree.predictions) || (typeof predictions !== 'undefined' ? predictions : {})
	};
	try {
		return JSON.stringify(payload);
	} catch (err) {
		return '';
	}
}

function getStoredEvalTreeFingerprint() {
	try {
		if (typeof lastEvaluatedTreeFingerprint === 'string' && lastEvaluatedTreeFingerprint) {
			return lastEvaluatedTreeFingerprint;
		}
		var store = typeof storage !== 'undefined' ? storage : null;
		if ((!store || !store.lastEvaluatedTreeFingerprint) && window.localStorage && sessionId) {
			store = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		return (store && store.lastEvaluatedTreeFingerprint) || '';
	} catch (err) {
		return '';
	}
}

function snapshotEvaluatedTree() {
	var fingerprint = currentEvalTreeFingerprint();
	lastEvaluatedTreeFingerprint = fingerprint;
	try {
		if (typeof storage !== 'object' || !storage) {
			storage = {};
		}
		if (window.localStorage && sessionId && window.localStorage.getItem(sessionId)) {
			storage = JSON.parse(window.localStorage.getItem(sessionId) || '{}');
		}
		storage.lastEvaluatedTreeFingerprint = fingerprint;
		window.localStorage.setItem(sessionId, JSON.stringify(storage));
	} catch (err) {}
	return fingerprint;
}

function hasTreeChangedSinceEvaluation() {
	var previous = getStoredEvalTreeFingerprint();
	if (!previous) {
		return true;
	}
	return currentEvalTreeFingerprint() !== previous;
}

function hasCompletedEvaluation() {
	return !!getStoredEvalTreeFingerprint() || hasEvalRunResults();
}

function updateEvalActionButtons() {
	var primary = document.getElementById('play-primary-action');
	var replay = document.getElementById('rerunEvaluation');
	var fresh = document.getElementById('newEvaluation');
	if (currentPlayMode !== 'evaluation') {
		if (replay) replay.classList.add('hidden');
		if (fresh) fresh.classList.add('hidden');
		return;
	}
	var completed = hasCompletedEvaluation();
	var treeChanged = hasTreeChangedSinceEvaluation();
	if (evalFlowPhase === 'ready') {
		if (primary) {
			primary.classList.remove('hidden');
			primary.textContent = 'Evaluate model';
			primary.title = 'Run the evaluation and obtain a score';
		}
		if (replay) replay.classList.add('hidden');
		if (fresh) fresh.classList.add('hidden');
		return;
	}
	if (evalFlowPhase === 'running') {
		if (primary) primary.classList.add('hidden');
		if (replay) replay.classList.add('hidden');
		if (fresh) fresh.classList.add('hidden');
		return;
	}
	if (evalFlowPhase === 'done') {
		if (primary) primary.classList.add('hidden');
		if (replay) {
			replay.classList.toggle('hidden', !completed);
			replay.textContent = 'Replay evaluation';
			replay.title = 'Watch the same evaluation again without saving a new attempt';
		}
		if (fresh) {
			var allowNew = completed && treeChanged && !leaderboardReplayOnly;
			fresh.classList.toggle('hidden', !allowNew);
			fresh.textContent = 'Run new evaluation';
			fresh.title = leaderboardReplayOnly
				? 'New submissions are disabled for trees loaded from the leaderboard'
				: 'Evaluate again because your tree has changed';
		}
		return;
	}
	if (primary) primary.classList.add('hidden');
	if (replay) replay.classList.add('hidden');
	if (fresh) fresh.classList.add('hidden');
}

function ensureEvalTutorialStats() {
	if ((!confidences.player && confidences.player !== 0) &&
		typeof assignBoxes === 'function' &&
		typeof getPredictions === 'function' &&
		typeof cards !== 'undefined' && cards.trainingSet) {
		assignBoxes(cards.trainingSet);
		getPredictions(cards.trainingSet, typeof entryMode !== 'undefined' && entryMode);
	}
	if (typeof OPPONENTS !== 'undefined' && OPPONENTS) {
		confidences.machine = OPPONENTS.overfitted.confidence;
		confidences.hybrid = OPPONENTS.humanGuided.confidence;
	}
}

function fillEvalTutorialConfidences() {
	ensureEvalTutorialStats();
	var userEl = document.getElementById('confidence-user');
	var machineEl = document.getElementById('confidence-stoopid-ai');
	var hybridEl = document.getElementById('confidence-hybrid');
	if (userEl && confidences && (confidences.player || confidences.player === 0)) {
		userEl.textContent = confidences.player + '%';
	}
	if (machineEl && confidences && confidences.machine) {
		machineEl.textContent = confidences.machine + '%';
	}
	if (hybridEl && confidences && confidences.hybrid) {
		hybridEl.textContent = confidences.hybrid + '%';
	}
}

function syncEvalRunResultsPaint(options) {
	options = options || {};
	if (!hasEvalRunResults() || typeof paintRun !== 'function') {
		return;
	}
	for (var n = 1; n <= 4; n++) {
		if (!results[n]) continue;
		paintRun(n, {
			userLevel: options.userLevel || 3,
			skipOpponents: !!options.skipOpponents,
			skipTotal: !!options.skipTotal
		});
		if (options.includeMachine && results[n].machineLabel) {
			var machineCell = document.getElementById('result' + n + '-stoopid-ai');
			if (machineCell) machineCell.innerHTML = results[n].machineLabel;
		}
		if (options.includeHybrid && results[n].hybridLabel) {
			var hybridCell = document.getElementById('result' + n + '-hybrid');
			if (hybridCell) hybridCell.innerHTML = results[n].hybridLabel;
		}
		if (options.includeTotal) {
			var totalCell = document.getElementById('result' + n + '-score');
			if (totalCell) totalCell.innerHTML = '<b>' + results[n].score + '</b>';
		}
	}
}

function getEvalTutorialBaseReveal() {
	return ['col-player', 'col-confidence', 'row-you', 'col-runs', 'col-detail', 'detail-a', 'detail-b', 'detail-score'];
}

function getEvalTutorialSteps() {
	ensureEvalTutorialStats();
	var pct = (confidences && (confidences.player || confidences.player === 0)) ? confidences.player : 0;
	var matched = Math.round((pct / 100) * 20);
	var machinePct = (confidences && confidences.machine) ? confidences.machine : 100;
	var hybridPct = (confidences && confidences.hybrid) ? confidences.hybrid : 0;
	var withResults = hasEvalRunResults();
	var base = getEvalTutorialBaseReveal();
	var withUserRuns = withResults ? base.concat(['run-user']) : base.slice();
	var afterMachine = withUserRuns.concat(['row-machine', 'machine-confidence']);
	var afterHybrid = afterMachine.concat(['row-hybrid', 'hybrid-confidence']);
	var afterCompare = afterHybrid.concat(withResults ? ['run-machine', 'run-hybrid'] : []);
	var allReveal = afterCompare.concat(['row-total'].concat(withResults ? ['run-total'] : []));

	return [
		{
			message: 'Welcome to evaluation.',
			reveal: ['col-player'],
			ms: 3200
		},
		{
			message: 'You have built a model. Based upon the training data it matched ' + pct + '% of the cards (' + matched + '/20).',
			reveal: ['col-player'],
			ms: 6500
		},
		{
			message: 'This percentage is your confidence in your model.',
			reveal: ['col-player', 'col-confidence', 'row-you'],
			pulse: ['you', 'you-confidence'],
			fill: function() {
				var el = document.getElementById('confidence-user');
				if (el) el.textContent = pct + '%';
			},
			ms: 5500
		},
		{
			message: 'To evaluate your model, we will now pick 4 sets of never before seen cards.',
			reveal: ['col-player', 'col-confidence', 'row-you', 'col-runs'],
			pulse: ['col-runs'],
			ms: 6000
		},
		{
			message: 'After each run, we will work out what % were correctly classified.',
			reveal: base.slice(0, 5).concat(['detail-a'].concat(withResults ? ['run-user'] : [])),
			pulse: withResults ? ['detail-a', 'run-user'] : ['detail-a'],
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 1, skipOpponents: true, skipTotal: true });
				}
			},
			ms: withResults ? 7500 : 6000
		},
		{
			message: 'Then we measure the difference from your claimed confidence.',
			reveal: base.slice(0, 5).concat(['detail-a', 'detail-b'].concat(withResults ? ['run-user'] : [])),
			pulse: withResults ? ['detail-b', 'run-user'] : ['detail-b'],
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 2, skipOpponents: true, skipTotal: true });
				}
			},
			ms: withResults ? 7000 : 5500
		},
		{
			message: 'And finally we subtract the difference from the amount classified correctly to get your score.',
			reveal: withUserRuns,
			pulse: withResults ? ['detail-score', 'run-user'] : ['detail-score'],
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 3, skipOpponents: true, skipTotal: true });
				}
			},
			ms: withResults ? 8000 : 7000
		},
		{
			message: 'But that is not all.',
			reveal: withUserRuns,
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 3, skipOpponents: true, skipTotal: true });
				}
			},
			ms: 2800
		},
		{
			message: 'The same cards in each run will be put through two more trees to see who was best.',
			reveal: withUserRuns,
			ms: 6000
		},
		{
			message: 'The first is a tree built solely by a machine from the data. It only sees numbers, and has no ability to logically reason. So it claims ' + machinePct + '% accuracy.',
			reveal: afterMachine,
			pulse: ['machine', 'machine-confidence'],
			fill: function() {
				var el = document.getElementById('confidence-stoopid-ai');
				if (el) el.textContent = machinePct + '%';
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 3, skipOpponents: true, skipTotal: true });
				}
			},
			ms: withResults ? 9500 : 9000
		},
		{
			message: 'The second is where a human has given the machine rules based on knowledge of the problem. A human-in-the-loop version.',
			reveal: afterHybrid,
			pulse: ['hybrid', 'hybrid-confidence'],
			fill: function() {
				var el = document.getElementById('confidence-hybrid');
				if (el) el.textContent = hybridPct + '%';
				if (withResults) {
					syncEvalRunResultsPaint({ userLevel: 3, skipOpponents: true, skipTotal: true });
				}
			},
			ms: withResults ? 8500 : 7500
		},
		{
			message: 'Depending on how you compare to both you might gain points, or lose points.',
			reveal: afterCompare,
			pulse: withResults ? ['run-machine', 'run-hybrid'] : null,
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({
						userLevel: 3,
						skipOpponents: true,
						skipTotal: true,
						includeMachine: true,
						includeHybrid: true
					});
				}
			},
			ms: withResults ? 7000 : 5500
		},
		{
			message: 'After all four runs your total is calculated and added to the leaderboard.',
			reveal: allReveal,
			pulse: withResults ? ['total', 'run-total'] : ['total'],
			fill: function() {
				if (withResults) {
					syncEvalRunResultsPaint({
						userLevel: 3,
						includeMachine: true,
						includeHybrid: true,
						includeTotal: true
					});
				}
			},
			ms: withResults ? 7000 : 6000
		},
		{
			message: 'Good luck.',
			reveal: allReveal,
			ms: 3200
		}
	];
}

function allEvalTutorialRevealKeys() {
	return [
		'col-player', 'col-confidence', 'col-detail', 'col-runs',
		'row-you', 'row-machine', 'row-hybrid', 'row-total',
		'detail-a', 'detail-b', 'detail-score',
		'machine-confidence', 'hybrid-confidence',
		'run-user', 'run-machine', 'run-hybrid', 'run-total'
	];
}

function setEvalTutorialMessage(text, done) {
	var msg = document.getElementById('eval-tutorial-message');
	if (!msg) {
		if (typeof done === 'function') done();
		return;
	}
	var show = function() {
		msg.textContent = text || '';
		// Force reflow so fade-in always runs after content swap.
		void msg.offsetWidth;
		msg.classList.remove('is-faded');
		if (typeof done === 'function') {
			setTimeout(done, EVAL_TUTORIAL_FADE_MS);
		}
	};
	if (!msg.textContent || msg.classList.contains('is-faded')) {
		show();
		return;
	}
	msg.classList.add('is-faded');
	setTimeout(show, EVAL_TUTORIAL_FADE_MS + EVAL_TUTORIAL_GAP_MS);
}

function applyEvalTutorialStep(step, done) {
	if (!step) {
		if (typeof done === 'function') done();
		return;
	}
	setEvalTutorialMessage(step.message, function() {
		if (!evalTutorialActive) {
			return;
		}
		revealEvalParts(step.reveal || []);
		if (typeof step.fill === 'function') {
			step.fill();
		}
		pulseEvalParts(step.pulse || []);
		if (typeof done === 'function') done();
	});
}

function completeEvalTutorial() {
	stopEvalTutorialTimer();
	evalTutorialActive = false;
	evalTutorialIndex = -1;
	clearEvalTutorialPulses();
	revealEvalParts(allEvalTutorialRevealKeys());
	fillEvalTutorialConfidences();
	if (hasEvalRunResults()) {
		syncEvalRunResultsPaint();
	}
	var resume = evalTutorialResumePhase === 'done' || hasCompletedEvaluation() ? 'done' : 'ready';
	setEvalFlowChrome(resume);
}

function runEvalTutorialStep() {
	if (!evalTutorialActive || currentPlayMode !== 'evaluation') {
		return;
	}
	var steps = getEvalTutorialSteps();
	if (evalTutorialIndex >= steps.length) {
		completeEvalTutorial();
		return;
	}
	var step = steps[evalTutorialIndex];
	evalTutorialIndex += 1;
	applyEvalTutorialStep(step, function() {
		if (!evalTutorialActive || currentPlayMode !== 'evaluation') {
			return;
		}
		stopEvalTutorialTimer();
		evalTutorialTimer = setTimeout(runEvalTutorialStep, step.ms || 4500);
	});
}

function startEvalTutorial() {
	stopEvalTutorialTimer();
	evalTutorialResumePhase = hasCompletedEvaluation() ? 'done' : 'ready';
	evalTutorialActive = true;
	evalTutorialIndex = 0;
	resetEvalTutorialTable({ keepConfidences: false });
	var msg = document.getElementById('eval-tutorial-message');
	if (msg) {
		msg.textContent = '';
		msg.classList.add('is-faded');
	}
	setEvalResultsPending(false);
	setEvalFlowChrome('tutorial');
	runEvalTutorialStep();
}

function skipEvalTutorial() {
	if (!getEvalTeamName()) {
		setEvalFlowChrome('team');
		return;
	}
	completeEvalTutorial();
}

function replayEvalTutorial() {
	if (currentPlayMode !== 'evaluation') {
		return;
	}
	if (!getEvalTeamName()) {
		setEvalFlowChrome('team');
		return;
	}
	startEvalTutorial();
}

function updateEvalTutorialReplayButton() {
	var btn = document.querySelector('[data-eval-tutorial-replay]');
	if (!btn) return;
	var show = currentPlayMode === 'evaluation' &&
		(evalFlowPhase === 'ready' || evalFlowPhase === 'done');
	btn.classList.toggle('hidden', !show);
}

function setEvalStatusVisible(visible) {
	var status = document.getElementById('evaluationStatus');
	if (!status) return;
	var hasContent = !!(status.textContent && status.textContent.trim()) || !!(status.innerHTML && status.innerHTML.trim());
	status.classList.toggle('hidden', !visible || !hasContent);
}

function setEvalFlowChrome(phase) {
	evalFlowPhase = phase || 'idle';
	var flow = document.getElementById('game-eval-flow');
	var actions = document.getElementById('game-play-actions');
	var error = document.getElementById('eval-team-error');

	if (error) {
		error.classList.add('hidden');
	}

	if (evalFlowPhase !== 'tutorial') {
		stopEvalTutorialTimer();
		evalTutorialActive = false;
	}

	if (evalFlowPhase === 'idle' || evalFlowPhase === 'ready' || evalFlowPhase === 'running' || evalFlowPhase === 'done') {
		if (flow) flow.classList.add('hidden');
		if (actions) actions.classList.remove('is-flow-hidden');
		setEvalResultsPending(evalFlowPhase !== 'ready' && evalFlowPhase !== 'running' && evalFlowPhase !== 'done');
		if (evalFlowPhase === 'ready') {
			setEvalStatusVisible(false);
		}
		if (evalFlowPhase === 'running') {
			setEvalResultsPending(false);
			revealEvalParts(allEvalTutorialRevealKeys());
			fillEvalTutorialConfidences();
			setEvalStatusVisible(true);
		}
		if (evalFlowPhase === 'done') {
			setEvalResultsPending(false);
			revealEvalParts(allEvalTutorialRevealKeys());
			fillEvalTutorialConfidences();
			if (hasEvalRunResults()) {
				syncEvalRunResultsPaint();
			}
			setEvalStatusVisible(true);
		}
		if (evalFlowPhase === 'done') {
			if (typeof syncEvalResultsCollapsedFromStorage === 'function') {
				syncEvalResultsCollapsedFromStorage();
			} else if (typeof setEvalResultsCollapsed === 'function') {
				setEvalResultsCollapsed(false, { skipPersist: true });
			}
		} else if (typeof setEvalResultsCollapsed === 'function') {
			setEvalResultsCollapsed(false, { skipPersist: true });
		}
		updateEvalActionButtons();
		updateEvalTutorialReplayButton();
		return;
	}

	if (flow) flow.classList.remove('hidden');
	if (actions) actions.classList.add('is-flow-hidden');
	if (typeof setEvalResultsCollapsed === 'function') {
		setEvalResultsCollapsed(false, { skipPersist: true });
	}
	updateEvalTutorialReplayButton();
	if (evalFlowPhase === 'team') {
		setEvalResultsPending(true);
		showEvalFlowStep('team');
		setEvalStatusVisible(false);
		var input = document.getElementById('eval-team-name');
		if (input && !input.value) {
			var preset = '';
			if (typeof presetTeam === 'string' && presetTeam.trim()) {
				preset = presetTeam.trim();
			} else if (typeof player_name === 'string' && player_name.trim() && player_name.trim() !== 'Team') {
				preset = player_name.trim();
			}
			if (preset) {
				input.value = preset;
			}
		}
		if (input) {
			setTimeout(function() { input.focus(); }, 0);
		}
		return;
	}

	if (evalFlowPhase === 'tutorial') {
		setEvalResultsPending(false);
		showEvalFlowStep('tutorial');
		setEvalStatusVisible(false);
	}
}

function beginEvaluationFlow() {
	if (hasCompletedEvaluation()) {
		setEvalFlowChrome('done');
		return;
	}
	resetEvalTutorialTable();
	setEvalFlowChrome('team');
}

function continueEvalTeamStep() {
	var input = document.getElementById('eval-team-name');
	var error = document.getElementById('eval-team-error');
	var name = input && input.value ? input.value.trim() : '';
	if (!name) {
		if (error) error.classList.remove('hidden');
		if (input) input.focus();
		return false;
	}
	if (error) error.classList.add('hidden');
	setEvalTeamName(name);
	markSessionPendingTeam(name);
	startEvalTutorial();
	return true;
}

function markSessionPendingTeam(name) {
	var nextAttempt = 1;
	try {
		if (typeof attempt === 'number' && !isNaN(attempt)) {
			nextAttempt = attempt + 1;
		} else if (storage && typeof storage.attempt === 'number') {
			nextAttempt = storage.attempt + 1;
		}
	} catch (err) {}
	sessionPendingTeam = {
		name: String(name || '').trim(),
		attempt: nextAttempt
	};
	if (typeof renderSessionLeaderboardPending === 'function') {
		renderSessionLeaderboardPending();
	} else if (typeof loadLeaderboards === 'function') {
		loadLeaderboards();
	}
}

function clearSessionPendingTeam() {
	sessionPendingTeam = null;
}

function syncPlayChrome(mode) {
	document.querySelectorAll('.game-deck-panel').forEach(function(panel) {
		var deck = panel.getAttribute('data-deck');
		var show = (deck === 'training' && mode === 'training') ||
			(deck === 'test' && mode === 'test') ||
			(deck === 'evaluation' && mode === 'evaluation');
		panel.classList.toggle('hidden', !show);
	});

	var primary = document.getElementById('play-primary-action');
	var status = document.getElementById('evaluationStatus');
	var summary = document.getElementById('game-run-summary');
	var flow = document.getElementById('game-eval-flow');
	var actions = document.getElementById('game-play-actions');

	if (mode !== 'evaluation') {
		stopEvalTutorialTimer();
		evalTutorialActive = false;
		evalFlowPhase = 'idle';
		if (flow) flow.classList.add('hidden');
		if (actions) actions.classList.remove('is-flow-hidden');
		setEvalResultsPending(true);
		resetEvalTutorialTable();
		updateEvalActionButtons();
	}

	if (primary) {
		if (mode === 'evaluation') {
			if (hasCompletedEvaluation() && evalFlowPhase !== 'running' && evalFlowPhase !== 'tutorial') {
				evalFlowPhase = 'done';
			}
			if (evalFlowPhase === 'idle') {
				beginEvaluationFlow();
			} else {
				setEvalFlowChrome(evalFlowPhase);
			}
			if (typeof hideRunSummaryPanel === 'function') {
				hideRunSummaryPanel();
			}
		} else {
			primary.textContent = 'Run model';
			primary.title = 'Try your tree with the cards';
			primary.classList.remove('hidden');
		}
	}
	if (mode === 'evaluation') {
		if (typeof clearNonEvaluationCardsFromTree === 'function') {
			clearNonEvaluationCardsFromTree();
		}
		setEvalStatusVisible(evalFlowPhase === 'done' || evalFlowPhase === 'running');
		updateEvalActionButtons();
		updateEvalTutorialReplayButton();
	} else if (status) {
		status.classList.add('hidden');
	}
	if (mode === 'training' && summary && !summary.classList.contains('hidden')) {
		/* keep training summary if already showing */
	}
	if (typeof updateGuideNavVisibility === 'function') {
		updateGuideNavVisibility();
	}
}

function setPlayMode(mode, options) {
	options = options || {};
	if (mode !== 'training' && mode !== 'test' && mode !== 'evaluation') {
		mode = 'training';
	}
	if (!options.force && mode !== currentPlayMode && !canEnterPlayMode(mode)) {
		syncPlayChrome(currentPlayMode);
		return false;
	}
	if (!options.fromGuide && !options.fromGuideRestore &&
		typeof guideTourActive === 'function' && guideTourActive() &&
		mode === 'evaluation' && typeof skipGuidedTour === 'function') {
		skipGuidedTour();
	}

	currentPlayMode = mode;
	document.body.classList.remove('stage-training', 'stage-test', 'stage-evaluation');
	document.body.classList.add('stage-' + mode);
	syncPlayChrome(mode);

	try {
		if (mode === 'training') {
			if (typeof setGameTreeEditable === 'function') {
				setGameTreeEditable(true);
			}
			if (typeof returnCardsInstant === 'function') {
				returnCardsInstant(cards.testSet, 'test-set', 'p');
				returnCardsInstant(cards.evaluationSet, 'evaluation-set', 'r');
			}
			if (typeof hideRunSummaryPanel === 'function' && !options.keepSummary) {
				hideRunSummaryPanel();
			}
		} else {
			if (typeof setGameTreeEditable === 'function') {
				setGameTreeEditable(false);
			}
			if (mode === 'test') {
				if (typeof returnCardsInstant === 'function') {
					returnCardsInstant(cards.trainingSet, 'training-set', 'b');
					returnCardsInstant(cards.evaluationSet, 'evaluation-set', 'r');
				}
				if (window.gameTree && typeof window.gameTree.showAllLeafCards === 'function') {
					window.gameTree.showAllLeafCards();
				}
				/* Guided test reshuffles; plain mode entry keeps current set if any */
				if (!cards.testSet.length && typeof getRandomPurples === 'function') {
					getRandomPurples(20);
				}
				if (typeof dealTestSet === 'function') {
					dealTestSet();
				}
			}
			if (mode === 'evaluation') {
				if (typeof returnCardsInstant === 'function') {
					returnCardsInstant(cards.trainingSet, 'training-set', 'b');
					returnCardsInstant(cards.testSet, 'test-set', 'p');
				}
				if (window.gameTree && typeof window.gameTree.showAllLeafCards === 'function') {
					window.gameTree.showAllLeafCards();
				}
			}
		}
	} catch (err) {
		console.log(err);
	}
	return true;
}

function showPlayScreen() {
	document.querySelectorAll('section').forEach(function(section) {
		if (section.id === 'leaderboards') {
			return;
		}
		section.classList.add('hidden');
	});
	var play = document.getElementById('play');
	if (play) {
		play.classList.remove('hidden');
	}
	var workspace = document.getElementById('game-workspace');
	if (workspace) {
		workspace.classList.remove('hidden');
	}
	document.querySelectorAll('.game-header a.toggle-link').forEach(function(link) {
		link.classList.remove('selected');
		if (link.getAttribute('href') === '#play') {
			link.classList.add('selected');
		}
	});
	setPlayMode(currentPlayMode || 'training', { force: true });
}

function openInstructionsModal() {
	var modal = document.getElementById('instructions-modal');
	if (modal && typeof modal.showModal === 'function' && !modal.open) {
		modal.showModal();
	}
}

function closeInstructionsModal() {
	var modal = document.getElementById('instructions-modal');
	if (modal && modal.open) {
		modal.close();
	}
}

function activeDeckConfig() {
	if (currentPlayMode === 'test') {
		return { set: cards.testSet, boxId: 'test-set', color: 'p' };
	}
	if (currentPlayMode === 'evaluation') {
		return { set: cards.evaluationSet, boxId: 'evaluation-set', color: 'r' };
	}
	return { set: cards.trainingSet, boxId: 'training-set', color: 'b' };
}

$(document).ready(function() {
	addListeners();
	showPlayScreen();

	document.querySelectorAll('.toggle-link').forEach(function(item) {
		item.addEventListener('click', function(e) {
			var href = this.getAttribute('href');
			if (!href || href.charAt(0) !== '#') {
				return;
			}
			e.preventDefault();
			var targetId = href.substring(1);

			if (targetId === 'instructions' || this.hasAttribute('data-instructions-open')) {
				openInstructionsModal();
				return;
			}

			closeInstructionsModal();

			if (targetId === 'play') {
				showPlayScreen();
				return;
			}

			document.querySelectorAll('section').forEach(function(section) {
				if (section.id === 'leaderboards') {
					return;
				}
				section.classList.add('hidden');
			});
			document.querySelectorAll('.game-header a.toggle-link').forEach(function(link) {
				link.classList.remove('selected');
			});
			this.classList.add('selected');
			var target = document.getElementById(targetId);
			if (target) {
				target.classList.remove('hidden');
			}
			var workspace = document.getElementById('game-workspace');
			if (workspace) {
				workspace.classList.add('hidden');
			}
			document.body.classList.remove('stage-training', 'stage-test', 'stage-evaluation');

			if (targetId === 'charts' && !chartRendered) {
				renderChart();
				chartRendered = true;
			}
		});
	});

	document.querySelectorAll('[data-play-mode]').forEach(function(el) {
		el.addEventListener('click', function(e) {
			var mode = this.getAttribute('data-play-mode');
			if (!mode) {
				return;
			}
			if (this.classList.contains('play-mode-link')) {
				e.preventDefault();
				closeInstructionsModal();
				showPlayScreen();
			}
			setPlayMode(mode);
		});
	});

	var primary = document.getElementById('play-primary-action');
	if (primary) {
		primary.addEventListener('click', function() {
			if (currentPlayMode === 'evaluation') {
				if (!getEvalTeamName()) {
					setEvalFlowChrome('team');
					return;
				}
				setEvalTeamName(getEvalTeamName());
				if (hasCompletedEvaluation() && !hasTreeChangedSinceEvaluation()) {
					replayOnly = true;
				} else {
					replayOnly = false;
				}
				if (typeof autoEvaluate === 'function') {
					autoEvaluate();
				}
				return;
			}
			if (window.gameTree && typeof window.gameTree.validateSplitsForRun === 'function') {
				if (!window.gameTree.validateSplitsForRun()) {
					return;
				}
			}
			var cfg = activeDeckConfig();
			if (typeof sortCards === 'function' && cfg.set) {
				sortCards(cfg.set, cfg.color);
			}
		});
	}

	var newEval = document.getElementById('newEvaluation');
	if (newEval) {
		newEval.addEventListener('click', function() {
			if (leaderboardReplayOnly) {
				updateEvalActionButtons();
				return;
			}
			if (!getEvalTeamName()) {
				setEvalFlowChrome('team');
				return;
			}
			if (!hasTreeChangedSinceEvaluation()) {
				updateEvalActionButtons();
				return;
			}
			setEvalTeamName(getEvalTeamName());
			replayOnly = false;
			if (typeof autoEvaluate === 'function') {
				autoEvaluate();
			}
		});
	}

	var rerun = document.getElementById('rerunEvaluation');
	if (rerun) {
		rerun.addEventListener('click', function() {
			replayOnly = true;
			if (typeof autoEvaluate === 'function') {
				autoEvaluate();
			}
		});
	}

	document.addEventListener('keydown', function(event) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (typeof canLoadSessionLeaderboardResult === 'function' && !canLoadSessionLeaderboardResult()) return;
		var lbRow = event.target.closest && event.target.closest('#session-leaderboard-body tr[data-result-id].is-loadable');
		if (!lbRow || lbRow.getAttribute('data-pending-team')) return;
		event.preventDefault();
		if (typeof loadSessionLeaderboardResult === 'function') {
			loadSessionLeaderboardResult(lbRow.getAttribute('data-result-id'));
		}
	});

	document.addEventListener('click', function(event) {
		var lbRow = event.target.closest('#session-leaderboard-body tr[data-result-id]');
		if (lbRow && !lbRow.getAttribute('data-pending-team') && lbRow.classList.contains('is-loadable')) {
			if (typeof canLoadSessionLeaderboardResult === 'function' && !canLoadSessionLeaderboardResult()) return;
			if (event.preventDefault) event.preventDefault();
			if (typeof loadSessionLeaderboardResult === 'function') {
				loadSessionLeaderboardResult(lbRow.getAttribute('data-result-id'));
			}
			return;
		}
		if (event.target.closest('[data-instructions-close]')) {
			closeInstructionsModal();
			return;
		}
		if (event.target.closest('[data-eval-team-continue]')) {
			if (event.preventDefault) event.preventDefault();
			continueEvalTeamStep();
			return;
		}
		if (event.target.closest('[data-eval-tutorial-skip]')) {
			if (event.preventDefault) event.preventDefault();
			skipEvalTutorial();
			return;
		}
		if (event.target.closest('[data-eval-tutorial-replay]')) {
			if (event.preventDefault) event.preventDefault();
			replayEvalTutorial();
			return;
		}
		if (event.target.closest('[data-eval-back-training]')) {
			if (event.preventDefault) event.preventDefault();
			if (typeof setPlayMode === 'function') {
				setPlayMode('training', { force: true });
			}
			return;
		}
	});

	var teamInput = document.getElementById('eval-team-name');
	if (teamInput) {
		teamInput.addEventListener('keydown', function(event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				continueEvalTeamStep();
			}
		});
	}

	var instructionsModal = document.getElementById('instructions-modal');
	if (instructionsModal) {
		instructionsModal.addEventListener('click', function(event) {
			if (event.target === instructionsModal) {
				closeInstructionsModal();
			}
		});
	}

	initFloatPanels();
});

function isGuideFloatVisible(guide) {
	if (!guide || !guide.classList.contains('is-visible')) {
		return false;
	}
	try {
		return window.getComputedStyle(guide).display !== 'none';
	} catch (err) {
		return true;
	}
}

function syncSessionLeaderboardStack() {
	var lb = document.querySelector('.game-session-lb-float');
	var guide = document.getElementById('game-guide-float');
	var workspace = document.getElementById('game-workspace');
	if (!lb) {
		return;
	}
	if (lb.getAttribute('data-user-positioned') === '1') {
		return;
	}
	if (isGuideFloatVisible(guide)) {
		var gap = 8;
		var nextTop = guide.offsetTop + guide.offsetHeight + gap;
		if (workspace) {
			var maxTop = Math.max(0, workspace.clientHeight - Math.min(lb.offsetHeight, workspace.clientHeight));
			nextTop = Math.min(nextTop, maxTop);
		}
		lb.style.top = nextTop + 'px';
		lb.style.right = '0.25rem';
		lb.style.left = 'auto';
	} else {
		lb.style.top = '';
		lb.style.right = '';
		lb.style.left = '';
	}
}

function initFloatPanels() {
	var workspace = document.getElementById('game-workspace');
	if (!workspace) {
		return;
	}
	document.querySelectorAll('[data-float-panel]').forEach(function(chrome) {
		initOneFloatPanel(chrome, workspace);
	});
	var guide = document.getElementById('game-guide-float');
	if (guide && typeof ResizeObserver !== 'undefined' && !guide._lbStackObserver) {
		guide._lbStackObserver = new ResizeObserver(function() {
			syncSessionLeaderboardStack();
		});
		guide._lbStackObserver.observe(guide);
	}
	window.addEventListener('resize', syncSessionLeaderboardStack);
	syncSessionLeaderboardStack();
}

window.syncSessionLeaderboardStack = syncSessionLeaderboardStack;

function initOneFloatPanel(chrome, workspace) {
	var handle = chrome.querySelector('.game-deck-drag-handle');
	if (!handle || chrome._floatBound) {
		return;
	}
	chrome._floatBound = true;

	var dragging = false;
	var pointerId = null;
	var startX = 0;
	var startY = 0;
	var originLeft = 0;
	var originTop = 0;

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function onPointerMove(event) {
		if (!dragging || event.pointerId !== pointerId) {
			return;
		}
		var bounds = workspace.getBoundingClientRect();
		var maxLeft = Math.max(0, bounds.width - chrome.offsetWidth);
		var maxTop = Math.max(0, bounds.height - Math.min(chrome.offsetHeight, bounds.height));
		var nextLeft = clamp(originLeft + (event.clientX - startX), 0, maxLeft);
		var nextTop = clamp(originTop + (event.clientY - startY), 0, maxTop);
		chrome.style.left = nextLeft + 'px';
		chrome.style.top = nextTop + 'px';
		chrome.style.right = 'auto';
	}

	function onPointerUp(event) {
		if (!dragging || event.pointerId !== pointerId) {
			return;
		}
		dragging = false;
		pointerId = null;
		chrome.classList.remove('is-dragging');
		chrome.setAttribute('data-user-positioned', '1');
		try {
			handle.releasePointerCapture(event.pointerId);
		} catch (err) {}
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);
		if (chrome.id === 'game-guide-float' || chrome.classList.contains('game-guide-float')) {
			syncSessionLeaderboardStack();
		}
	}

	handle.addEventListener('pointerdown', function(event) {
		if (event.button !== undefined && event.button !== 0) {
			return;
		}
		event.preventDefault();
		dragging = true;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		originLeft = chrome.offsetLeft;
		originTop = chrome.offsetTop;
		chrome.classList.add('is-dragging');
		handle.setPointerCapture(event.pointerId);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
	});
}
