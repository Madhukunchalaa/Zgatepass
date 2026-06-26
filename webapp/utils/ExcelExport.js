sap.ui.define([], function () {
	"use strict";

	var HEADER_STYLE = {
		font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
		fill: { fgColor: { rgb: "1F4E79" } },
		alignment: { horizontal: "center", vertical: "center", wrapText: true },
		border: {
			top:    { style: "thin", color: { rgb: "0D3B66" } },
			bottom: { style: "thin", color: { rgb: "0D3B66" } },
			left:   { style: "thin", color: { rgb: "0D3B66" } },
			right:  { style: "thin", color: { rgb: "0D3B66" } }
		}
	};

	var ITEM_HEADER_STYLE = {
		font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
		fill: { fgColor: { rgb: "2E75B6" } },
		alignment: { horizontal: "center", vertical: "center", wrapText: true },
		border: {
			top:    { style: "thin", color: { rgb: "1A5C99" } },
			bottom: { style: "thin", color: { rgb: "1A5C99" } },
			left:   { style: "thin", color: { rgb: "1A5C99" } },
			right:  { style: "thin", color: { rgb: "1A5C99" } }
		}
	};

	var BORDER_THIN = {
		top:    { style: "thin", color: { rgb: "BDC3C7" } },
		bottom: { style: "thin", color: { rgb: "BDC3C7" } },
		left:   { style: "thin", color: { rgb: "BDC3C7" } },
		right:  { style: "thin", color: { rgb: "BDC3C7" } }
	};

	function _getDataStyle(isEvenRow) {
		var s = {
			font: { sz: 10, name: "Calibri" },
			alignment: { vertical: "center" },
			border: BORDER_THIN
		};
		if (isEvenRow) {
			s.fill = { fgColor: { rgb: "D6E4F0" } };
		}
		return s;
	}

	function _parseDate(v) {
		if (!v) { return null; }
		if (v instanceof Date) { return isNaN(v.getTime()) ? null : v; }
		if (typeof v !== "string") { return null; }
		var m = v.match(/\/Date\((\d+)/);
		if (m) { return new Date(parseInt(m[1], 10)); }
		var p = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
		if (p) { return new Date(parseInt(p[3], 10), parseInt(p[2], 10) - 1, parseInt(p[1], 10)); }
		p = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
		if (p) { return new Date(parseInt(p[3], 10), parseInt(p[2], 10) - 1, parseInt(p[1], 10)); }
		if (/^\d{8}$/.test(v) && !/^0+$/.test(v)) {
			return new Date(v.substring(0, 4) + "-" + v.substring(4, 6) + "-" + v.substring(6, 8));
		}
		var d = new Date(v);
		return isNaN(d.getTime()) ? null : d;
	}

	function _autoColWidths(ws, range) {
		var cols = [];
		for (var C = range.s.c; C <= range.e.c; C++) {
			var max = 8;
			for (var R = 0; R <= range.e.r; R++) {
				var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
				if (cell && cell.v != null) {
					var len = String(cell.v).length;
					if (R === 0) { len += 2; }
					if (len > max) { max = len; }
				}
			}
			cols.push({ wch: Math.min(max + 3, 45) });
		}
		return cols;
	}

	function _fmtDate(d) {
		if (!d) { return ""; }
		return d.getDate().toString().padStart(2, "0") + "-" +
			(d.getMonth() + 1).toString().padStart(2, "0") + "-" +
			d.getFullYear();
	}

	return {
		fmtDate: _fmtDate,

		/**
		 * @param {Array}  aRows           – flat array of row objects (keys become headers)
		 * @param {string} sSheetName      – Excel tab name
		 * @param {string} sFileName       – file.xlsx
		 * @param {number} [iHeaderFields] – number of header-level columns (rest are item cols, shown in lighter header)
		 */
		filterByDate: function (aData, sDateField, dFrom, dTo) {
			if (!dFrom && !dTo) { return aData; }
			var dToEnd = dTo ? new Date(dTo.getFullYear(), dTo.getMonth(), dTo.getDate(), 23, 59, 59, 999) : null;
			return aData.filter(function (o) {
				var dVal = _parseDate(o[sDateField]);
				if (!dVal) { return false; }
				var day = new Date(dVal.getFullYear(), dVal.getMonth(), dVal.getDate());
				if (dFrom && day < new Date(dFrom.getFullYear(), dFrom.getMonth(), dFrom.getDate())) { return false; }
				if (dToEnd && day > dToEnd) { return false; }
				return true;
			});
		},

		download: function (aRows, sSheetName, sFileName, iHeaderFields) {
			if (!aRows || !aRows.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}

			var ws = XLSX.utils.json_to_sheet(aRows);
			var range = XLSX.utils.decode_range(ws["!ref"]);
			var totalCols = range.e.c + 1;
			var headerFieldCount = iHeaderFields || totalCols;

			for (var C = range.s.c; C <= range.e.c; C++) {
				var addr = XLSX.utils.encode_cell({ r: 0, c: C });
				if (!ws[addr]) { continue; }
				ws[addr].s = (C < headerFieldCount) ? HEADER_STYLE : ITEM_HEADER_STYLE;
			}

			for (var R = 1; R <= range.e.r; R++) {
				var isEven = (R % 2 === 0);
				var style = _getDataStyle(isEven);
				for (var C2 = range.s.c; C2 <= range.e.c; C2++) {
					var addr2 = XLSX.utils.encode_cell({ r: R, c: C2 });
					if (!ws[addr2]) {
						ws[addr2] = { v: "", t: "s" };
					}
					ws[addr2].s = style;
				}
			}

			ws["!cols"] = _autoColWidths(ws, range);

			var wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, sSheetName);
			XLSX.writeFile(wb, sFileName);
			sap.m.MessageToast.show(sSheetName + " downloaded.");
		}
	};
});
