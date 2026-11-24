var chartRendered = false;
var currentPlayMode = 'training';

function canEnterPlayMode(mode) {
	if (mode === 'training') {
		return true;
	}
	if (typeof ensureLeafPredictionsForEval === 'function') {
		var finalizeError = ensureLeafPredictionsForEval(cards.trainingSet);
		if (finalizeError) {
			alert(finalizeError);
			return false;
		}
	} else if (typeof predictionsComplete === 'function' && !predictionsComplete(cards.trainingSet)) {
		alert('You must ensure you have a valid prediction (not ?) for all branch ends in your tree before you can continue.');
		return false;
	}
	if (!modelHasRun && !confidences.player && confidences.player !== 0) {
		alert('You must run your model on the training set before you can proceed to test or evaluation.');
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

function syncPlayChrome(mode) {
	document.querySelectorAll('.game-deck-panel').forEach(function(panel) {
		var deck = panel.getAttribute('data-deck');
		var show = (deck === 'training' && mode === 'training') ||
			(deck === 'test' && mode === 'test') ||
			(deck === 'evaluation' && mode === 'evaluation');
		panel.classList.toggle('hidden', !show);
	});

	var primary = document.getElementById('play-primary-action');
	var rerun = document.getElementById('rerunEvaluation');
	var status = document.getElementById('evaluationStatus');
	var summary = document.getElementById('game-run-summary');
	if (primary) {
		if (mode === 'evaluation') {
			primary.textContent = 'Evaluate model';
			primary.title = 'Run the evaluation and obtain a score';
			var evalDone = rerun && !rerun.classList.contains('hidden');
			primary.classList.toggle('hidden', !!evalDone);
			if (typeof hideRunSummaryPanel === 'function') {
				hideRunSummaryPanel();
			}
		} else {
			primary.textContent = 'Run model';
			primary.title = 'Try your tree with the cards';
			primary.classList.remove('hidden');
		}
	}
	if (status) {
		status.classList.toggle('hidden', mode !== 'evaluation');
	}
	if (rerun && mode !== 'evaluation') {
		rerun.classList.add('hidden');
	}
	if (mode === 'training' && summary && !summary.classList.contains('hidden')) {
		/* keep training summary if already showing */
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

	var rerun = document.getElementById('rerunEvaluation');
	if (rerun) {
		rerun.addEventListener('click', function() {
			replayOnly = true;
			if (typeof autoEvaluate === 'function') {
				autoEvaluate();
			}
		});
	}

	document.addEventListener('click', function(event) {
		if (event.target.closest('[data-instructions-close]')) {
			closeInstructionsModal();
		}
	});

	var instructionsModal = document.getElementById('instructions-modal');
	if (instructionsModal) {
		instructionsModal.addEventListener('click', function(event) {
			if (event.target === instructionsModal) {
				closeInstructionsModal();
			}
		});
	}

	initDeckFloat();
});

function initDeckFloat() {
	var chrome = document.querySelector('[data-deck-float]');
	var handle = chrome && chrome.querySelector('.game-deck-drag-handle');
	var workspace = document.getElementById('game-workspace');
	if (!chrome || !handle || !workspace || chrome._floatBound) {
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
		try {
			handle.releasePointerCapture(event.pointerId);
		} catch (err) {}
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerUp);
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
