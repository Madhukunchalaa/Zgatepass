sap.ui.define([
	"sap/base/strings/formatMessage"
], function (formatMessage) {
	"use strict";

	return {
		formatMessage: formatMessage,

		/**
		 * Determines the path of the image depending if its a phone or not the smaller or larger image version is loaded
		 *
		 * @public
		 * @param {boolean} bIsPhone the value to be checked
		 * @param {string} sImagePath The path of the image
		 * @returns {string} path to image
		 */
		srcImageValue : function (bIsPhone, sImagePath) {
			if (bIsPhone) {
				sImagePath += "_small";
			}
			return sImagePath + ".jpg";
		},

		/**
		 * Formats any date into DD-MMM-YYYY string (e.g. 07-Oct-2026)
		 * @public
		 * @param {string|Date} vDate
		 * @returns {string}
		 */
		formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "" || vDate === "null" || vDate === "undefined") { return ""; }
			var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
			var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };
			var toDDMMMYYYY = function (d) {
				if (!d || isNaN(d.getTime())) return "";
				var dd = String(d.getDate()).padStart(2, "0");
				var mmm = MONTHS[d.getMonth()];
				var yyyy = d.getFullYear();
				return dd + "-" + mmm + "-" + yyyy;
			};
			if (vDate instanceof Date) { return toDDMMMYYYY(vDate); }
			if (typeof vDate === "string") {
				var sClean = vDate.trim();
				if (!sClean || sClean === "00000000") return "";
				var mMatch = sClean.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
				if (mMatch) {
					return mMatch[1] + "-" + mMatch[2].charAt(0).toUpperCase() + mMatch[2].slice(1).toLowerCase() + "-" + mMatch[3];
				}
				if (/^\d{8}$/.test(sClean)) {
					var d8 = new Date(parseInt(sClean.slice(0, 4), 10), parseInt(sClean.slice(4, 6), 10) - 1, parseInt(sClean.slice(6, 8), 10));
					return toDDMMMYYYY(d8);
				}
				if (sClean.indexOf("/Date(") !== -1) {
					var ms = parseInt(sClean.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
					if (!isNaN(ms)) { return toDDMMMYYYY(new Date(ms)); }
				}
				var sNorm = sClean.split("T")[0].replace(/\//g, "-");
				var aParts = sNorm.split("-");
				if (aParts.length === 3) {
					if (aParts[0].length === 4) {
						return toDDMMMYYYY(new Date(parseInt(aParts[0], 10), parseInt(aParts[1], 10) - 1, parseInt(aParts[2], 10)));
					}
					if (aParts[2].length === 4) {
						var mIndex = isNaN(aParts[1]) ? MONTHS_MAP[aParts[1].toUpperCase()] : (parseInt(aParts[1], 10) - 1);
						if (mIndex !== undefined && !isNaN(mIndex)) {
							return toDDMMMYYYY(new Date(parseInt(aParts[2], 10), mIndex, parseInt(aParts[0], 10)));
						}
					}
				}
				var dP = new Date(sClean);
				if (!isNaN(dP.getTime())) return toDDMMMYYYY(dP);
			}
			return String(vDate || "");
		}
	};
});