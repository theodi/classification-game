(function(global) {
  function actualCity(card) {
    if (card.target === 0 || card.target === '0') {
      return 'New York';
    }
    if (card.target === 1 || card.target === '1') {
      return 'San Francisco';
    }
    return card.city;
  }

  function factorAt(tree, position) {
    var key = position === '' ? '_' : position;
    return tree.factors && tree.factors[key] ? tree.factors[key] : '';
  }

  function boundaryAt(tree, position) {
    var key = position === '' ? 'a' : position + 'a';
    var value = tree.boundaries && tree.boundaries[key];
    return value === undefined || value === null ? '' : String(value);
  }

  function predictionAt(tree, position) {
    var node = tree.predictions && tree.predictions[position];
    if (!node) {
      return null;
    }
    if (typeof node === 'string') {
      return node === '?' ? null : node;
    }
    return node.prediction && node.prediction !== '?' ? node.prediction : null;
  }

  function routeCard(tree, card) {
    var position = '';
    for (var depth = 0; depth < 3; depth++) {
      var factor = factorAt(tree, position);
      var boundary = boundaryAt(tree, position);
      if (!factor || boundary === '') {
        break;
      }
      if (parseFloat(card[factor]) <= parseFloat(boundary)) {
        position += 'l';
      } else {
        position += 'r';
      }
    }
    return position;
  }

  function predict(tree, card) {
    return predictionAt(tree, routeCard(tree, card));
  }

  function evaluateOpponentTree(node, card) {
    var current = node;
    while (current && !current.leaf) {
      if (parseFloat(card[current.feature]) <= parseFloat(current.threshold)) {
        current = current.left;
      } else {
        current = current.right;
      }
    }
    return current ? current.leaf : null;
  }

  function scoreTraining(tree, packCards) {
    var right = 0;
    packCards.forEach(function(card) {
      if (predict(tree, card) === actualCity(card)) {
        right += 1;
      }
    });
    var total = packCards.length || 20;
    return Math.round((right / total) * 100);
  }

  function countMatches(cardset, predictFn) {
    var right = 0;
    cardset.forEach(function(card) {
      if (predictFn(card) === actualCity(card)) {
        right += 1;
      }
    });
    return right;
  }

  function scoreAgainst(run, vsBucket, confidence, percent, winPoints, drawPoints, losePoints) {
    var diff = Math.abs(confidence - percent);
    if (run.playerDiff < diff) {
      run.score += winPoints;
      vsBucket.win += 0.25;
    } else if (run.playerDiff === diff) {
      run.score += drawPoints;
      vsBucket.draw += 0.25;
    } else {
      run.score += losePoints;
      vsBucket.lost += 0.25;
    }
  }

  function scoreEvaluation(tree, packCards, evalSet, opponents) {
    var trainingConfidence = scoreTraining(tree, packCards);
    var confidences = {
      player: trainingConfidence,
      machine: opponents && opponents.overfitted ? opponents.overfitted.confidence : null,
      hybrid: opponents && opponents.humanGuided ? opponents.humanGuided.confidence : null
    };
    var vsMachine = { win: 0, draw: 0, lost: 0 };
    var vsHybrid = { win: 0, draw: 0, lost: 0 };
    var runs = (evalSet && evalSet.runs) ? evalSet.runs : [];
    var result = {};
    var totalScore = trainingConfidence;

    for (var number = 1; number <= 4; number++) {
      var cardset = runs[number - 1] || [];
      var right = countMatches(cardset, function(card) { return predict(tree, card); });
      var percent = cardset.length ? Math.round((right / cardset.length) * 100) : 0;
      var run = {
        player: percent,
        playerDiff: Math.abs(trainingConfidence - percent),
        score: 0
      };
      run.score = percent - run.playerDiff;

      if (opponents && opponents.humanGuided) {
        var hybridPercent = Math.round((countMatches(cardset, function(card) {
          return evaluateOpponentTree(opponents.humanGuided.tree, card);
        }) / (cardset.length || 1)) * 100);
        scoreAgainst(run, vsHybrid, confidences.hybrid, hybridPercent, 25, 10, 0);
        run.hybrid = hybridPercent;
      }
      if (opponents && opponents.overfitted) {
        var machinePercent = Math.round((countMatches(cardset, function(card) {
          return evaluateOpponentTree(opponents.overfitted.tree, card);
        }) / (cardset.length || 1)) * 100);
        scoreAgainst(run, vsMachine, confidences.machine, machinePercent, 10, 0, -20);
        run.machine = machinePercent;
      }

      result[number] = run;
      totalScore += run.score;
    }

    return {
      confidences: confidences,
      result: result,
      score: totalScore,
      vsMachine: vsMachine,
      vsHybrid: vsHybrid
    };
  }

  global.TreeScore = {
    actualCity: actualCity,
    routeCard: routeCard,
    predict: predict,
    scoreTraining: scoreTraining,
    scoreEvaluation: scoreEvaluation
  };
})(typeof window !== 'undefined' ? window : global);
