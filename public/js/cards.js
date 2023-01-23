var cards = [];
cards.trainingSet = [];
cards.testSet = [];
cards.evaluationSet = [];

var rCount = 0;
var rDone = [];
var pCount = 0;
var pDone = [];
var maxCount = 20;
var predictions = {};
var confidences = {};
var results = {};
results.vsMachine = {};
results.vsMachine.win = 0;
results.vsMachine.draw = 0;
results.vsMachine.lost = 0;
results.vsHybrid = {};
results.vsHybrid.win = 0;
results.vsHybrid.draw = 0;
results.vsHybrid.lost = 0;
confidences.player = 0;

/* Page functions */

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}

function getUrlParam(parameter, defaultvalue){
    var urlparameter = defaultvalue;
    if(window.location.href.indexOf(parameter) > -1){
        urlparameter = getUrlVars()[parameter];
        }
    return urlparameter;
}

function startInput() {
    var number = prompt("Evaluation set: Please enter a number between 1 and 242", "1");

    if (number == null || number == "") {
        number = 0;
    }
    processNumber(number);
}
function startInputPurple() {
    var number = prompt("Test set: Please enter a number between 1 and 250", "1");
    if (number == null || number == "") {
        number = 0;
    }
    processNumberPurple(number);
}

function processNumber(val) {
    if (rCount >= maxCount) {
        alert("You have reached your limit of " + maxCount + " cards!");
    }
    if (rDone[val]) {
        alert("You already have that card");
    } else {
        getRedCard(val);
    }
}

function processNumberPurple(val) {
    if (pCount >= maxCount) {
        alert("You have reached your limit of " + maxCount + " cards!");
    }
    if (pDone[val]) {
        alert("You already have that card");
    } else {
        getPurpleCard(val);
    }
}

function selectSet(set) {
    if (set=="evaluation" && confidences.player==0) {
        alert("Please make sure you have clicked 'run model' against the training set prior to evaluation.");
    }
    document.getElementById("instructions-set").style.display = "none";
    document.getElementById("instructions-tab").classList.remove("selected");
    document.getElementById("training-set").style.display = "none";
    document.getElementById("training-tab").classList.remove("selected");
    document.getElementById("test-set").style.display = "none";
    document.getElementById("test-tab").classList.remove("selected");
    document.getElementById("evaluation-set").style.display = "none";
    document.getElementById("evaluation-tab").classList.remove("selected");

    document.getElementById(set+"-set").style.display = "block";
    document.getElementById(set+"-tab").classList.add("selected");  
}

window.addEventListener('keydown', function (e) {
    if ( e.key == "=" ) {
        $(".model-button").show();
    }
}, false);

/* Add card functions */

function getBlueCards(group,card) {
    var count = 1;
    var index = 1;
    d3.csv('/data/houses.csv', function(data) {
        data.index = index;
        if (data.group == group) {
            cards.trainingSet.push(data);
            renderCard(data,index,'blue');
            count += 1;
        }
        index += 1;
    });
}

function getRedCard(card) {
    var index = 1;
    d3.csv('/data/red_cards.csv', function(data) {
        if (index == card && rCount < maxCount) {
            data.city = "?";
            data.index = index;
            cards.evaluationSet.push(data);
            renderRedCard(data,index,'red');
            rCount += 1;
            rDone[index] = true;
            if (rCount == maxCount) {
                $('#fill-reds').hide();
                $('#remove-reds').show();
            }
        }
        index += 1;
    });
}

function getPurpleCard(card) {
    var index = 1;
    d3.csv('/data/houses.csv', function(data) {
        if (index == card && pCount < maxCount) {
            data.index = index;
            cards.testSet.push(data);
            renderPurpleCard(data,index,'purple');
            pCount += 1;
            pDone[index] = true;
            if (pCount == maxCount) {
                $('#fill-purples').hide();
                $('#remove-purples').show();
            }
        }
        index += 1;
    });
}

function getRandomReds(count) {
    var i = rCount;
    var min = 1;
    var max = 242;
    var random = [];
    while (i<count) {
        var card = Math.floor((Math.random() * max) + min);
        if (!random[card]) {
            random[card] = true;
            getRedCard(card);
            i++;
        }
    }
}

function getRandomPurples(count) {
    var i = pCount;
    var min = 1;
    var max = 250;
    var random = [];
    while (i<count) {
        var card = Math.floor((Math.random() * max) + min);
        if (!random[card]) {
            random[card] = true;
            getPurpleCard(card);
            i++;
        }
    }
}

/* Remove card functions */

function removeCards(cardset,color) {
    while (cardset.length > 0) {
        cardset.forEach(function(card,value,index) {
            cardset = removeCard(card.index,cardset,color);
        });
    }
}

function removeCard(id,cardset,color){
    $('#'+color+id).remove();
    if (color == "r") { 
        rCount = rCount - 1;
        rDone[id] = false;
        $('#remove-reds').hide();
        $('#fill-reds').show();
    }
    if (color == "b") { 
        bCount = bCount - 1;
        bDone[id] = false;
    }
    if (color == "p") { 
        pCount = pCount - 1;
        pDone[id] = false;
        $('#remove-purples').hide();
        $('#fill-purples').show();
    }
    cardset.forEach(function(card,index,object) {
        if (card.index == id) {
            object.splice(index,1);
        }
    });
    return cardset;
}

/* Render card functions */

function renderCard(data,count,color) {
	$('#area').append('<card draggable="true" class="draggable drag-drop" id="b'+count+'"><h1 class="target">'+data.city+'</h1><h1 class="number">#'+count+'</h1><image src="/img/house.png"></image><table class="'+color+'"><tr><td class="attribute">Bathrooms</td><td class="value">'+data.bath+'</td></tr><tr><td class="attribute">Bedrooms</td><td class="value">'+data.beds+'</td></tr><tr><td class="attribute">Year built</td><td class="value">'+data.year_built+'</td></tr><tr><td class="attribute">Elevation</td><td class="value">'+formatNumber(data.elevation)+'ft</td></tr><tr><td class="attribute">Square Footage</td><td class="value">'+formatNumber(data.sqft)+'</td></tr><tr><td class="attribute">Price</td><td class="value">$'+formatNumber(data.price)+'</td></tr><tr><td class="attribute">Price per sqft</td><td class="value">$'+formatNumber(data.price_per_sqft)+'</td></tr></table></card>');
}

function renderRedCard(data,count,color) {
    $('#evaluation-set').append('<card id="r'+count+'" class="draggable drag-drop"><h1 class="target">'+data.city+'</h1><h1 class="number">#'+count+'</h1><image src="/img/house.png"></image><table class="'+color+'"><tr><td class="attribute">Bathrooms</td><td class="value">'+data.bath+'</td></tr><tr><td class="attribute">Bedrooms</td><td class="value">'+data.beds+'</td></tr><tr><td class="attribute">Year built</td><td class="value">'+data.year_built+'</td></tr><tr><td class="attribute">Elevation</td><td class="value">'+formatNumber(data.elevation)+'ft</td></tr><tr><td class="attribute">Square Footage</td><td class="value">'+formatNumber(data.sqft)+'</td></tr><tr><td class="attribute">Price</td><td class="value">$'+formatNumber(data.price)+'</td></tr><tr><td class="attribute">Price per sqft</td><td class="value">$'+formatNumber(data.price_per_sqft)+'</td></tr></table><div></card>');
}
function renderPurpleCard(data,count,color) {
    $('#test-set').append('<card id="p'+count+'" class="draggable drag-drop"><h1 class="target">'+data.city+'</h1><h1 class="number">#'+count+'</h1><image src="/img/house.png"></image><table class="'+color+'"><tr><td class="attribute">Bathrooms</td><td class="value">?????</td></tr><tr><td class="attribute">Bedrooms</td><td class="value">?????</td></tr><tr><td class="attribute">Year built</td><td class="value">?????</td></tr><tr><td class="attribute">Elevation</td><td class="value">?????</td></tr><tr><td class="attribute">Square Footage</td><td class="value">?????</td></tr><tr><td class="attribute">Price</td><td class="value">?????</td></tr><tr><td class="attribute">Price per sqft</td><td class="value">?????</td></tr></table><div></card>');
}

function formatNumber(num) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

/* Animations */

function moveAnimate(element, newParent){
    //Allow passing in either a jQuery object or selector
    element = $(element);
    newParent= $(newParent);

    var oldOffset = element.offset();
    element.appendTo(newParent);
    var newOffset = element.offset();

    var temp = element.clone().appendTo('body');
    temp.css({
        'position': 'absolute',
        'left': oldOffset.left,
        'top': oldOffset.top,
        'z-index': 1000
    });
    element.hide();
    temp.animate({'top': newOffset.top, 'left': newOffset.left}, 'slow', function(){
       element.show();
       temp.remove();
    });
}

function animateCard(card,color) {
    moveAnimate('#'+color+card.index,'#box_' + card.box);
}

function returnCards(cardset,boxid,color) {
    var interval = 0;
    cardset.forEach(function(card,value,index) {
        $('#'+color+card.index).removeAttr('style');
        setTimeout(function() {
            moveAnimate('#'+color+card.index,'#'+boxid);
        },interval);
        interval += 100;
    });
}

/* Card sorter */

function sortCards(cardset,color,number) {
    var currentPosition = "";
    var interval = 0;
    cardset.forEach(function(card,value,index) {
        $('#'+color+card.index).removeAttr('style');
        setTimeout(function() { 
            animateCard(sortCard(card,currentPosition),color);
        },interval);
        interval += 200;
    });
    if (color=="b") {
        setTimeout(function() {
            getPredictions(cardset);
        },5000);
    }
    if (color=="r") {
        setTimeout(function() {
            getResult(cardset,number);
        },5000);
    }
}

function sortCard(card,currentPosition) {
    if (currentPosition == "") {
        card.box = "";  
    }

    var factor = $('#factor_'+currentPosition).val();
    var boundary = $('#condition_'+currentPosition+'a').val();
    if (!factor || !boundary) {
        return card;
    }
    if(parseFloat(card[factor]) <= boundary) {
        currentPosition = currentPosition + "l";
        card.box = card.box + "l";
        if (currentPosition.length < 3) {
            return sortCard(card,currentPosition);
        } else {
            return card;
        }
    } else {
        currentPosition = currentPosition + "r";
        card.box = card.box + "r";
        if (currentPosition.length < 3) {
            return sortCard(card,currentPosition);
        } else {
            return card;
        }
    }
}

function setElementToOption(elementid,option) {
    var select = document.getElementById(elementid);
    for(var i = 0;i < select.options.length;i++){
        if(select.options[i].value == option ){
            select.options[i].selected = true;
        }
    }
}

function getPredictions(cardset) {
    predictions = {};
    var right = 0;
    cardset.forEach(function(card,value,index) {
        if (!predictions[card.box]) {
            predictions[card.box] = {};
            predictions[card.box]["New York"] = 0;
            predictions[card.box]["San Francisco"] = 0;
        } 
        predictions[card.box][card.city] += 1;
    });
    for (const [box, values] of Object.entries(predictions)) {
        if (values["New York"] > values["San Francisco"]) { 
            predictions[box]["prediction"] = "New York";
            setElementToOption("prediction_box_"+box,"New York");
            right += values["New York"];
        } else if (values["New York"] < values["San Francisco"]) {
            predictions[box]["prediction"] = "San Francisco";
            setElementToOption("prediction_box_"+box,"San Francisco");
            right += values["San Francisco"];
        } else {
            predictions[box]["prediction"] = "?";
            setElementToOption("prediction_box_"+box,"?");
        }   
    }
    confidences.player = Math.round((right / 20) * 100);

    $('.prediction').show();
    document.getElementById("confidence-user").innerHTML = confidences.player + "%";
    $('.evaluation-button').show();
    if (group == 1 || group == 5) {
        confidences.machine = 100;
        confidences.hybrid = 90;
        document.getElementById("confidence-stoopid-ai").innerHTML = "100%";
        document.getElementById("confidence-hybrid").innerHTML = "90%";
    }
    if (group == 2) {
        confidences.machine = 100;
        confidences.hybrid = 70;
        document.getElementById("confidence-stoopid-ai").innerHTML = "100%";
        document.getElementById("confidence-hybrid").innerHTML = "70%";   
    }
    if (group == 4 || group == 3) {
        confidences.machine = 100;
        confidences.hybrid = 85;
        document.getElementById("confidence-stoopid-ai").innerHTML = "100%";
        document.getElementById("confidence-hybrid").innerHTML = "85%";   
    }
    if (group == 6) {
        confidences.machine = 100;
        confidences.hybrid = 80;
        document.getElementById("confidence-stoopid-ai").innerHTML = "100%";
        document.getElementById("confidence-hybrid").innerHTML = "80%";   
    }
    console.log("Group = " + group);
    saveData();
}

function updateConfidence(cardset) {
    var right = 0;
    for (const [box, values] of Object.entries(predictions)) {
        right += values[values["prediction"]];
    }
    confidences.player = Math.round((right / 20) * 100);
    document.getElementById("confidence-user").innerHTML = confidences.player + "%";
}

function getResult(cardset,number) {
    var right = 0;
    var targets = ["New York","San Francisco"];
    var pres = 0;
    cardset.forEach(function(card,value,index) {
        if (targets[card.target] == predictions[card.box]["prediction"]) {
            right +=1;
        }
    });
    pres = (right / 20) * 100;
    results[number].player = Math.round(pres);
    results[number].beatMachine = "unknown";
    results[number].beatHybrid = "unknown";
    results[number].playerDiff = confidences.player - results[number].player;
    if (results[number].playerDiff < 0) {
        results[number].playerDiff = results[number].playerDiff * -1;
    }

    pscore = Math.round(pres) - results[number].playerDiff;
    results[number].score += pscore;
    $("#result"+number+"-user").html(pscore + "<br/>" + "(= "+Math.round(pres)+" - " + results[number].playerDiff + ")");

    /* Old scoring

    results[number].score += 100 - results[number].playerDiff;
    document.getElementById("result"+number+"-user").innerHTML = Math.round(pres) + "%";
    */
    getAIResult_Hybrid(cardset,number);
    if (group == 1) {
        getAIResult_Stoopid_1(cardset,number);
    }
     if (group == 2) {
        getAIResult_Stoopid_2(cardset,number);
    }
    saveData();
} 

function getAIResult_Hybrid(cardset,number) {
    var right = 0;
    var targets = ["New York","San Francisco"];
    var hres = 0;
    cardset.forEach(function(card,value,index) {
        if (card.price_per_sqft <= 875 && card.target == 1) {
            right += 1;
        }
        if (card.price_per_sqft > 875) {
            if (card.elevation <= 28 && card.target == 0) {
                right += 1;
            } else if (card.elevation > 28 && card.target == 1) {
                right += 1;
            }
        }
    });
    hres = (right / 20) * 100;
    results[number]["hybrid"] = Math.round(hres);
    hybridDiff = confidences.hybrid - results[number].hybrid;
    if (hybridDiff < 0) {
        hybridDiff = hybridDiff * -1;
    }
    if (results[number].playerDiff < hybridDiff) {
        results[number].beatHybrid = true;
        results[number].score += 25;
        results.vsHybrid.win += 0.25;
        $("#result"+number+"-hybrid").html("+25<br/>(You win)");
    } else if (results[number].playerDiff == hybridDiff) {
        results[number].score += 10;   
        results.vsHybrid.draw += 0.25;
        $("#result"+number+"-hybrid").html("+10<br/>(Draw)");
    } else {
        results.vsHybrid.lost += 0.25;
        $("#result"+number+"-hybrid").html("+0<br/>(You loose)");
    }

    //document.getElementById("result"+number+"-hybrid").innerHTML = Math.round(hres) + "%";
}

function processMachineResult(right,number) {
    var mres = 0;
    mres = (right / 20) * 100;
    results[number]["machine"] = Math.round(mres);
    machineDiff = confidences.machine - results[number].machine;
    if (machineDiff < 0) {
        machineDiff = machineDiff * -1;
    }
    if (results[number].playerDiff < machineDiff) {
        results[number].beatMachine = true;
        results[number].score += 10;
        results.vsMachine.win += 0.25;
        $("#result"+number+"-stoopid-ai").html("+10<br/>(You win)");
    } else if (results[number].playerDiff == machineDiff) {
        results.vsMachine.draw += 0.25;
        $("#result"+number+"-stoopid-ai").html("+0<br/>(Draw)");
    } else {
        results.vsMachine.lost += 0.25;
        results[number].score -= 20;
        $("#result"+number+"-stoopid-ai").html("-20<br/>(You loose)");
    }
    //document.getElementById("result"+number+"-stoopid-ai").innerHTML = Math.round(mres) + "%";
}

function getAIResult_Stoopid_1(cardset,number) {
    var right = 0;
    var targets = ["New York","San Francisco"];
    cardset.forEach(function(card,value,index) {
        if (card.price_per_sqft <= 875 && card.target == 1) {
            right += 1;
        }
        if (card.price_per_sqft > 875) {
            if (card.year_built <= 2003.5 && card.target == 0) {
                right += 1;
            } else if (card.year_built > 2003.5) {
                if (card.bath <= 1.5 && card.target == 0) {
                    right += 1;
                } else if (card.bath > 1.5 && card.target == 1) {
                    right += 1;
                }
            }
        }
    });
    processMachineResult(right,number);
}

function getAIResult_Stoopid_2(cardset,number) {
    var right = 0;
    var targets = ["New York","San Francisco"];
    cardset.forEach(function(card,value,index) {
        if (card.price_per_sqft <= 1022) {
            if (card.year_built <= 1912) {
                if (card.year_built <= 1905 && card.target == 1) {
                    right += 1;
                } 
                if (card.year_built > 1905 && card.target == 0) {
                    right += 1;
                } 
            } else if (card.year_built > 1912 && card.target == 1) {
                right += 1;
            }
        } else {
            if (card.elevation <= 43 && card.target == 0) {
                right += 1;
            } else if (card.elevation > 43 && card.target == 1) {
                right += 1;
            }
        }
    });
    processMachineResult(right,number);
}

function autoEvaluate(number) {
    results[number] = {};
    results[number].score = 0;
    if(number == 1) {
        returnCards(cards.trainingSet,'area','b');
    }
    $("#evaluationButton").hide();
    $("#evaluationStatus").html("Selecting random cards for run " + number);
    setTimeout(function() { 
        getRandomReds(20); 
    },3000);
    setTimeout(function() {
        $("#evaluationStatus").html("Running models");
        sortCards(cards.evaluationSet,'r',number) 
    },5000);
    if (number < 4) {
        setTimeout(function() {
            removeCards(cards.evaluationSet,'r');
            number = number + 1;
            autoEvaluate(number);
        },12000);
    }
    if (number == 4) {
        setTimeout(function() {
            $("#evaluationStatus").html("Caluculating scores");
            $('#result1-score').html(results[1].score);
            $('#result2-score').html(results[2].score);
            $('#result3-score').html(results[3].score);
            $('#result4-score').html(results[4].score);
            results.score = confidences.player + results[1].score + results[2].score + results[3].score + results[4].score;
            saveResult();
        }, 12000)
        setTimeout(function() {
            loadLeaderboards();
            var score = confidences.player + results[1].score + results[2].score + results[3].score + results[4].score;
            var guide = '<table class="results" style="font-size: 0.8em; max-width: 66%; margin-left: auto; margin-right: auto;"><tr><td>500+</td><td>Incredible!</td></tr><tr><td>450 - 500</td><td>Expert</td></tr><tr><td>400 - 450</td><td>Solid effort</td></tr><tr><td>300 - 400</td><td>Average</td></tr><tr><td>0 - 300</td><td>Points for trying (did you overfit?)</td></tr></table>';
            $("#evaluationStatus").html("Your score: " + score + "<br/><br/>" + guide);
        }, 14000)
        setTimeout(function() {
            $( "#leaderboards" ).clone().appendTo( "#evaluation-set" );
        }, 15000)
    }
}