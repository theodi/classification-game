function toggleDrag() {
  // Get the checkbox
  var checkBox = document.getElementById("myCheck");

  // If the checkbox is checked, display the output text
  if (checkBox.checked == true){
    document.getElementById("decision-tree-wrapper").classList.add("draggable","drag-drop");
  } else {
    document.getElementById("decision-tree-wrapper").classList.remove("draggable","drag-drop"); 
  }
}