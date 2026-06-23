sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent"
], function(Controller, UIComponent) {
	"use strict";

	return Controller.extend("zgpms.meilpower.com.controller.BaseController", {

		/**
		 * Convenience method for accessing the router.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter : function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name.
		 * @public
		 * @param {string} [sName] the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel : function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.core.mvc.View} the view instance
		 */
		setModel : function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Returns a promises which resolves with the resource bundle value of the given key <code>sI18nKey</code>
		 *
		 * @public
		 * @param {string} sI18nKey The key
		 * @param {sap.ui.core.model.ResourceModel} oResourceModel The resource model
		 * @param {string[]} [aPlaceholderValues] The values which will repalce the placeholders in the i18n value
		 * @returns {Promise<string>} The promise
		 */
		getBundleTextByModel: function(sI18nKey, oResourceModel, aPlaceholderValues){
			return oResourceModel.getResourceBundle().then(function(oBundle){
				return oBundle.getText(sI18nKey, aPlaceholderValues);
			});
		},

		/**
		 * Derives a human-readable status string from raw OData approval fields.
		 * Works for both Gate Pass (uses StoreAmmend) and Scrap (no StoreAmmend).
		 */
		_deriveStatus: function (oItem) {
			if (!oItem) { return "Pending"; }
			var fnGet = function (sProp) {
				var sT = sProp.toLowerCase();
				for (var k in oItem) {
					if (k.toLowerCase() === sT) {
						var v = oItem[k];
						return (v === null || v === undefined || v === "null" || v === "undefined") ? "" : String(v).trim().toUpperCase();
					}
				}
				return "";
			};

			var s1      = fnGet("Approval1");
			var s2      = fnGet("Approval2");
			var sStatus = fnGet("Status") || fnGet("ReqStatus");
			var sAppReq = fnGet("ApprovalReq");
			var sAmmend = fnGet("StoreAmmend");

			if (s1 === "R" || s2 === "R" || sAppReq === "R" || sStatus === "REJECTED") { return "Rejected"; }
			if (sAmmend === "AM" || s1 === "AM" || s2 === "AM" || sAppReq === "AM" || sAppReq === "AMENDMENT" || sStatus === "AM" || sStatus === "AMENDMENT") { return "Amendment"; }
			if (s2 || sStatus === "APPROVED") { return "Approved"; }
			var sStoreRmk = fnGet("STORERemarks") || fnGet("StoreRemarks");
			if (sStoreRmk && sStoreRmk !== "NULL") { return "Approved"; }
			if (s1 && s1 !== "X" && s1 !== "PENDING" && !s2) { return "Store Approval Pending"; }
			if (sStatus === "STORE APPROVAL PENDING") { return "Store Approval Pending"; }
			if (sStatus === "CAN" || sStatus === "CANCELLED") { return "Cancelled"; }
			if (sStatus === "C"   || sStatus === "CLOSED")    { return "Closed"; }
			return "Pending";
		},

		/**
		 * Formats a date value from any backend format (OData /Date(...), YYYYMMDD, ISO, Date object)
		 * into DD-MM-YYYY string for display. Returns "" for null/empty/invalid input.
		 */
		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "") { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
				return vDate.slice(6, 8) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(0, 4);
			}
			if (typeof vDate === "string" && vDate.indexOf("Date") !== -1) {
				var ts = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
				if (!isNaN(ts)) { vDate = new Date(ts); }
			}
			if (typeof vDate === "string") {
				var aParts = vDate.split("T")[0].split("-");
				if (aParts.length === 3 && aParts[0].length === 4) {
					return aParts[2] + "-" + aParts[1] + "-" + aParts[0];
				}
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				var dd = String(vDate.getDate()).padStart(2, "0");
				var mm = String(vDate.getMonth() + 1).padStart(2, "0");
				var yyyy = vDate.getFullYear();
				return dd + "-" + mm + "-" + yyyy;
			}
			return String(vDate || "");
		},

		/**
		 * Same as _formatDate but returns DD/MM/YYYY (slash separator) — used in print/PDF contexts.
		 */
		_formatDateSlash: function (vDate) {
			return this._formatDate(vDate).replace(/-/g, "/");
		},

		/**
		 * Normalises a raw UOM string from the backend to one of KG / L / MT.
		 * Defaults to KG when the value is unrecognised or empty.
		 */
		_normalizeUOM: function (sRawUom) {
			var s = (sRawUom || "").toUpperCase();
			if (s.indexOf("KG") !== -1 || s.indexOf("KILOGRAM") !== -1) { return "KG"; }
			if (s.indexOf("LITRE") !== -1 || s.indexOf("LTR") !== -1 || s === "L" || s === "LIT") { return "L"; }
			if (s.indexOf("TON") !== -1 || s.indexOf("TO") !== -1 || s.indexOf("MT") !== -1) { return "MT"; }
			return "KG";
		},

		_mapMaterialType: function (sMaterial, sDescription) {
			sMaterial = (sMaterial || "").toUpperCase();
			sDescription = (sDescription || "").toUpperCase();
			
			// Valid dropdown keys
			var aValidKeys = ["Metal", "Rubber", "Oil", "Plastic", "Copper", "Batteries", "Spent Oil(Barrel Capacity)"];
			var sFound = aValidKeys.find(function(key) {
				return key.toUpperCase() === sMaterial;
			});
			if (sFound) {
				return sFound;
			}
			
			// Check description keywords
			if (sDescription.indexOf("COPPER") !== -1) return "Copper";
			if (sDescription.indexOf("BATTERY") !== -1 || sDescription.indexOf("BATTERIES") !== -1) return "Batteries";
			if (sDescription.indexOf("SPENT OIL") !== -1) return "Spent Oil(Barrel Capacity)";
			if (sDescription.indexOf("OIL") !== -1) return "Oil";
			if (sDescription.indexOf("RUBBER") !== -1) return "Rubber";
			if (sDescription.indexOf("PLASTIC") !== -1) return "Plastic";
			if (sDescription.indexOf("SCRAP") !== -1 || sDescription.indexOf("METAL") !== -1 || sDescription.indexOf("MS") !== -1) return "Metal";
			
			// Check material key keywords
			if (sMaterial.indexOf("COPPER") !== -1) return "Copper";
			if (sMaterial.indexOf("BATTERY") !== -1 || sMaterial.indexOf("BATTERIES") !== -1) return "Batteries";
			if (sMaterial.indexOf("SPENT") !== -1) return "Spent Oil(Barrel Capacity)";
			if (sMaterial.indexOf("OIL") !== -1) return "Oil";
			if (sMaterial.indexOf("RUBBER") !== -1) return "Rubber";
			if (sMaterial.indexOf("PLASTIC") !== -1) return "Plastic";
			if (sMaterial.indexOf("SCRAP") !== -1 || sMaterial.indexOf("METAL") !== -1 || sMaterial.indexOf("MS") !== -1) return "Metal";
			
			return "Metal"; // Default fallback
		}
	});

});