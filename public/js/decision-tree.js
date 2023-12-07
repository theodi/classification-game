/* Decision tree functions */
function onchange() {
	    var condition_a = $('#condition_a');
	    var condition_b = $('#condition_b');
	    condition_b.val(condition_a.val());

	    var condition_la = $('#condition_la');
	    var condition_lb = $('#condition_lb');
	    condition_lb.val(condition_la.val());

	    var condition_ra = $('#condition_ra');
	    var condition_rb = $('#condition_rb');
	    condition_rb.val(condition_ra.val());

	    var condition_lra = $('#condition_lra');
	    var condition_lrb = $('#condition_lrb');
	    condition_lrb.val(condition_lra.val());

	    var condition_rla = $('#condition_rla');
	    var condition_rlb = $('#condition_rlb');
	    condition_rlb.val(condition_rla.val());

	    var condition_lla = $('#condition_lla');
	    var condition_llb = $('#condition_llb');
	    condition_llb.val(condition_lla.val());

	    var condition_rra = $('#condition_rra');
	    var condition_rrb = $('#condition_rrb');
	    condition_rrb.val(condition_rra.val());

	    saveData();
}

function saveData() {
	storage = {};
	if (window.localStorage.getItem("classification-game") != "null") {
		storage = JSON.parse(window.localStorage.getItem("classification-game"));
	}

	var boundaries = {};
	boundaries["a"] = $('#condition_a').val();

  boundaries["la"] = $('#condition_la').val();
  boundaries["ra"] = $('#condition_ra').val();

  boundaries["lra"] = $('#condition_lra').val();
  boundaries["rla"] = $('#condition_rla').val();
  boundaries["lla"] = $('#condition_lla').val();
  boundaries["rra"] = $('#condition_rra').val();

  var factors = {};
	factors["_"] = $('#factor_').val();

	factors["l"] = $('#factor_l').val();
	factors["r"] = $('#factor_r').val();

	factors["lr"] = $('#factor_lr').val();
	factors["rl"] = $('#factor_rl').val();
	factors["ll"] = $('#factor_ll').val();
	factors["rr"] = $('#factor_rr').val();

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

	window.localStorage.setItem("classification-game",JSON.stringify(storage));
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
	if (resultId || isTutor) {
		console.log("Not saving result, view only");
		return;
	}
	storage = JSON.parse(window.localStorage.getItem("classification-game"));
	if (storage.results) {
		console.log("Have results object")
	} else {
		console.log("No results object");
		storage.results = [];
	}

	var result = {};
	result.playerName = storage.playerName;
	result.date = new Date().getTime();
	result.id = CryptoJS.MD5(result.playerName + result.date).toString();
	result.cardSet = group;
	result.sessionId = sessionId;

	result.tree = {};
	result.tree.factors = storage.factors;
	result.tree.boundaries = storage.boundaries;
	result.tree.predictions = storage.predictions;

	result.confidences = confidences;
	result.result = results;

	result.score = results.score;
	result.vsHybrid = results.vsHybrid;
	result.vsMachine = results.vsMachine;

	attempt = attempt + 1;
	result.attempt = attempt;

	delete result.result.score;
	delete result.result.vsMachine;
	delete result.result.vsHybrid;

	storage.results.push(result);

	for (var i=0;i<storage.results.length;i++) {
		sendResult(storage.results[i]);
	}
	window.localStorage.setItem("classification-game",JSON.stringify(storage));

}

function confirmReset() {
	if (confirm("Are you sure you want to reset the tree? This blanks all decisions and boundaries.")) {
		resetTree();
	}
}

function resetTree() {
	player_name = storage.playerName;
	storage.factors = "";
	storage.boundaries = "";
	storage.predictions = "";
	storage.confidences = "";
	window.localStorage.setItem("classification-game",JSON.stringify(storage));

	alert("Tree reset, please refresh your browser to complete the reset!");

}

function changeName() {
	player_name = prompt("Welcome to the ODI machine learning game. Please enter your player name.",player_name);
	$('#playerWelcome').html("Welcome " + player_name);
  	$('#playerWelcome').css("display","inline");
	saveData();
	loadLeaderboards();
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
		attempt = storage.attempt;
		if (storage.playerName == ""){
	      player_name = prompt("Welcome to the ODI machine learning game. Please enter your player name.","");
	      $('#playerWelcome').html("Welcome " + player_name);
	      $('#playerWelcome').css("display","inline");
	    } else {
	      $('#playerWelcome').html("Welcome " + player_name);
	      $('#playerWelcome').css("display","inline");
	    }

		$('#factor_').val(factors["_"]);

		if (factors["l"]) {
			$('#factor_l').val(factors["l"]);
			addBranch('decision_l');
		}
		if (factors["r"]) {
			$('#factor_r').val(factors["r"]);
			addBranch('decision_r');
		}

		if (factors["lr"]) {
			$('#factor_lr').val(factors["lr"]);
			addBranch('decision_lr');
		}
		if (factors["rl"]) {
			$('#factor_rl').val(factors["rl"]);
			addBranch('decision_rl');
		}
		if (factors["ll"]) {
			$('#factor_ll').val(factors["ll"]);
			addBranch('decision_ll');
		}
		if (factors["rr"]) {
			$('#factor_rr').val(factors["rr"]);
			addBranch('decision_rr');
		}

		$('#condition_a').val(boundaries["a"]);
		$('#condition_b').val(boundaries["a"]);

		$('#condition_la').val(boundaries["la"]);
		$('#condition_lb').val(boundaries["la"]);
		$('#condition_ra').val(boundaries["ra"]);
		$('#condition_rb').val(boundaries["ra"]);

		$('#condition_lra').val(boundaries["lra"]);
		$('#condition_lrb').val(boundaries["lra"]);
		$('#condition_rla').val(boundaries["rla"]);
		$('#condition_rlb').val(boundaries["rla"]);
		$('#condition_lla').val(boundaries["lla"]);
		$('#condition_llb').val(boundaries["lla"]);
		$('#condition_rra').val(boundaries["rra"]);
		$('#condition_rrb').val(boundaries["rra"]);
	} catch (err) {

	}

	try {
		$('#prediction_box_l').val(predictions["l"].prediction);
		$('#prediction_box_r').val(predictions["r"].prediction);
    	$('#prediction_box_ll').val(predictions["ll"].prediction);
    	$('#prediction_box_lr').val(predictions["lr"].prediction);
    	$('#prediction_box_rl').val(predictions["rl"].prediction);
    	$('#prediction_box_rr').val(predictions["rr"].prediction);
    	$('#prediction_box_lll').val(predictions["lll"].prediction);
    	$('#prediction_box_llr').val(predictions["llr"].prediction);
    	$('#prediction_box_lrl').val(predictions["lrl"].prediction);
    	$('#prediction_box_lrr').val(predictions["lrr"].prediction);
    	$('#prediction_box_rll').val(predictions["rll"].prediction);
    	$('#prediction_box_rlr').val(predictions["rlr"].prediction);
    	$('#prediction_box_rrl').val(predictions["rrl"].prediction);
    	$('#prediction_box_rrr').val(predictions["rrr"].prediction);
    } catch (err) {}
}

function loadLeaderboardData() {
	if ((window.localStorage.getItem("classification-game") == "null" || window.localStorage.getItem("classification-game") == null) && resultId == "") {
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
			window.localStorage.setItem("classification-game",JSON.stringify(data));
			processLoad(storage);
			loadLeaderboards();
  		});
	} else if (isTutor) {
		$('#title').html("ODI Machine learning game (tutor mode)");
		player_name = '<span style="color:red">Tutor</span>';
		$('#playerWelcome').html("Welcome " + player_name);
  		$('#playerWelcome').css("display","inline");
  		storage = JSON.parse(window.localStorage.getItem("classification-game"));
		processLoad(storage);
		loadLeaderboards();
	} else {
		storage = JSON.parse(window.localStorage.getItem("classification-game"));
		processLoad(storage);
		loadLeaderboards();
	}
}

function browseCluster(cluster) {
	event.preventDefault();
	const filteredData = cards.trainingSet.filter(item => item.box === cluster);
	const indexNumbers = filteredData.map(item => item.index);
	const indexNumbersString = indexNumbers.join(',');
	const url = `/browse?cards=${indexNumbersString}`;
	window.open(url,'_blank');
}

function updatePredictions() {
	if (predictions["l"]) { predictions["l"].prediction = $('#prediction_box_l').find(":selected").val(); }
	if (predictions["r"]) { predictions["r"].prediction = $('#prediction_box_r').find(":selected").val(); }
    if (predictions["ll"]) { predictions["ll"].prediction = $('#prediction_box_ll').find(":selected").val(); }
    if (predictions["lr"]) { predictions["lr"].prediction = $('#prediction_box_lr').find(":selected").val(); }
    if (predictions["rl"]) { predictions["rl"].prediction = $('#prediction_box_rl').find(":selected").val(); }
    if (predictions["rr"]) { predictions["rr"].prediction = $('#prediction_box_rr').find(":selected").val(); }
    if (predictions["lll"]) { predictions["lll"].prediction = $('#prediction_box_lll').find(":selected").val(); }
    if (predictions["llr"]) { predictions["llr"].prediction = $('#prediction_box_llr').find(":selected").val(); }
    if (predictions["lrl"]) { predictions["lrl"].prediction = $('#prediction_box_lrl').find(":selected").val(); }
    if (predictions["lrr"]) { predictions["lrr"].prediction = $('#prediction_box_lrr').find(":selected").val(); }
    if (predictions["rll"]) { predictions["rll"].prediction = $('#prediction_box_rll').find(":selected").val(); }
    if (predictions["rlr"]) { predictions["rlr"].prediction = $('#prediction_box_rlr').find(":selected").val(); }
    if (predictions["rrl"]) { predictions["rrl"].prediction = $('#prediction_box_rrl').find(":selected").val(); }
    if (predictions["rrr"]) { predictions["rrr"].prediction = $('#prediction_box_rrr').find(":selected").val(); }
    updateConfidence(cards.trainingSet);
    saveData();
}
function addBranch(branch) {
	$('.'+branch).show();
	$('.'+branch+'_invert').hide();
}

function renderLeaderboard(data,prefix) {
  resultsCount = data.length;
  var rank = 0;
  var currentScore = 0;
  for (i=0;i<data.length;i++) {
  	var userClass = "";
  	if (data[i].score != currentScore) {
  		currentScore = data[i].score;
  		rank = rank + 1;
  	}
  	try {
  		for (j=0;j<storage.results.length;j++) {
	  		if (storage.results[j]["id"] == data[i].id) {
  				userClass = "user";
  				data[i].playerName = storage.playerName;
  			}
  		}
  	} catch (err) {}
  	if (data[i].playerName) {
		var displayName = data[i].playerName.substring(0,16);
		if (isTutor || prefix == "session") {
			displayName = data[i].playerName;
		}
  		var row = '<tr class="'+userClass+'"><td>'+rank+'</td><td>'+data[i].attempt+'</td><td>'+displayName+'</td><td>'+data[i].score+'</td></tr>';
  		$('#'+prefix+'-leaderboard-body').append(row);
  	} else {
  		var row = '<tr class="'+userClass+'"><td>'+rank+'</td><td>'+data[i].attempt+'</td><td>'+data[i].id.substring(0,10)+'</td><td>'+data[i].score+'</td></tr>';
  		$('#'+prefix+'-leaderboard-body').append(row);
  	}
  }
  $('#'+prefix+'-leaderboard').DataTable();
}

function loadLeaderboards() {
	console.log("loading leaderboards");
	$('#session-leaderboard-body').html("");
	$('#organisation-leaderboard-body').html("");
	$('#public-leaderboard-body').html("");
	$.getJSON('/leaderboard/' + leaderboardId + '/' + sessionId + '/results', function(data) {
		renderLeaderboard(data,"session");
  });
  $.getJSON('/leaderboard/' + leaderboardId + '/results', function(data) {
		renderLeaderboard(data,"organisation");
  });
  $.getJSON('/leaderboard/all/results', function(data) {
		renderLeaderboard(data,"public");
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