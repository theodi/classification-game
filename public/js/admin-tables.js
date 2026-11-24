(function() {
  if (!window.jQuery || !window.jQuery.fn.DataTable) {
    return;
  }

  $.extend(true, $.fn.dataTable.defaults, {
    searching: true,
    paging: true,
    pageLength: 25,
    info: true,
    autoWidth: false,
    // Search top-right; bottom: length | showing entries | paging
    dom: '<"dt-top"f>rt<"dt-bottom"<"dt-length"l><"dt-info"i><"dt-paginate"p>>',
    language: {
      search: 'Search:',
      emptyTable: 'No data yet'
    }
  });

  window.initAdminTable = function(selector, options) {
    var $table = $(selector);
    if (!$table.length) {
      return null;
    }
    if ($.fn.dataTable.isDataTable($table)) {
      $table.DataTable().destroy();
    }
    return $table.DataTable(options || {});
  };
})();
