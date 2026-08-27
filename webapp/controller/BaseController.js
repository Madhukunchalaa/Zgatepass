sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (Controller, UIComponent, MessageBox, MessageToast) {
	"use strict";

	return Controller.extend("zgpms.meilpower.com.controller.BaseController", {

		/**
		 * Convenience method for accessing the router in every controller.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name in every controller.
		 * @public
		 * @param {string} sName the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model in every controller.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.core.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Helper method to format date string or object to YYYYMMDD string format.
		 * @public
		 * @param {string|Date} sDisplayDate
		 * @returns {string} YYYYMMDD formatted string
		 */
		_dateToYYYYMMDD: function (sDisplayDate) {
			if (!sDisplayDate) { return ""; }
			if (sDisplayDate instanceof Date) {
				var d = sDisplayDate;
				return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			}
			var aParts = String(sDisplayDate).split("-");
			if (aParts.length === 3 && aParts[2].length === 4) {
				return aParts[2] + aParts[1] + aParts[0];
			}
			if (/^\d{8}$/.test(sDisplayDate)) { return sDisplayDate; }
			var d2 = new Date(sDisplayDate);
			if (!isNaN(d2.getTime())) {
				return d2.getFullYear() + String(d2.getMonth() + 1).padStart(2, '0') + String(d2.getDate()).padStart(2, '0');
			}
			return "";
		},

		/**
		 * Convenience method for getting the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onShareEmailPress: function () {
			var oViewModel = (this.getModel("objectView") || this.getModel("worklistView"));
			sap.m.URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},

		/**
		 * Convenience method for getting an i18n text string from the resource bundle.
		 * @public
		 * @param {string} sI18nKey key in i18n file
		 * @param {array} [aPlaceholderValues] optional array of placeholder replacement values
		 * @returns {string} translated text
		 */
		getText: function (sI18nKey, aPlaceholderValues) {
			var oBundle = this.getResourceBundle();
			if (!oBundle) { return sI18nKey; }
			return oBundle.getText(sI18nKey, aPlaceholderValues);
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
			if (s2 === "A2" || sStatus === "APPROVED") { return "Approved"; }
			if (s1 === "A1" || sStatus === "STORE APPROVAL PENDING") { return "Store Approval Pending"; }
			if (sStatus === "CAN" || sStatus === "CANCELLED") { return "Cancelled"; }
			if (sStatus === "C"   || sStatus === "CLOSED")    { return "Closed"; }
			return "HOD approval pending";
		},

		/**
		 * Formats a date value from any backend format (OData /Date(...), YYYYMMDD, ISO, Date object)
		 * into DD-MM-YYYY string for display. Returns "" for null/empty/invalid input.
		 */
		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "" || vDate === "null" || vDate === "undefined") { return ""; }
			if (vDate instanceof Date) {
				if (isNaN(vDate.getTime())) return "";
				var dd = String(vDate.getDate()).padStart(2, "0");
				var mm = String(vDate.getMonth() + 1).padStart(2, "0");
				var yyyy = vDate.getFullYear();
				return dd + "-" + mm + "-" + yyyy;
			}
			if (typeof vDate === "string") {
				var sClean = vDate.trim();
				if (!sClean || sClean === "00000000") return "";
				if (/^\d{8}$/.test(sClean)) {
					return sClean.slice(6, 8) + "-" + sClean.slice(4, 6) + "-" + sClean.slice(0, 4);
				}
				if (sClean.indexOf("/Date(") !== -1) {
					var ms = parseInt(sClean.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
					if (!isNaN(ms)) {
						var dMs = new Date(ms);
						if (!isNaN(dMs.getTime())) {
							var ddMs = String(dMs.getDate()).padStart(2, "0");
							var mmMs = String(dMs.getMonth() + 1).padStart(2, "0");
							var yyyyMs = dMs.getFullYear();
							return ddMs + "-" + mmMs + "-" + yyyyMs;
						}
					}
				}
				var aParts = sClean.split("T")[0].split("-");
				if (aParts.length === 3 && aParts[0].length === 4) {
					return aParts[2] + "-" + aParts[1] + "-" + aParts[0];
				}
				if (aParts.length === 3 && aParts[2].length === 4) {
					return aParts[0] + "-" + aParts[1] + "-" + aParts[2];
				}
				var dParsed = new Date(sClean); 
				
				if (!isNaN(dParsed.getTime())) {
					var ddP = String(dParsed.getDate()).padStart(2, "0");
					var mmP = String(dParsed.getMonth() + 1).padStart(2, "0");
					var yyyyP = dParsed.getFullYear();
					return ddP + "-" + mmP + "-" + yyyyP;
				}
			}
			return String(vDate || ""); 
			retur;
			
			
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
			return sRawUom || "";
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
		},

		/**
		 * Canonical ASHItm create payload — the exact field set and JSON types the
		 * backend expects (confirmed sample): SentQuantity/BalanceQuantity/
		 * SOQuantity/OpenQuantity/Totalvalue as raw NUMBERS, ItemNetPrice as a
		 * STRING, and no RequestedQuantity (removed from the entity).
		 */
		_buildAshItemPayload: function (o) {
			var n = function (v) { var f = parseFloat(v); return isNaN(f) ? 0 : f; };
			return {
				AshGatePassNo:  o.AshGatePassNo || "",
				ItemNo:         o.ItemNo        || "",
				Material:       o.Material      || "",
				MaterialDesc:   o.MaterialDesc  || "",
				HSNCode:        o.HSNCode       || "",
				HSNDesc:        o.HSNDesc       || "",
				UOM:            o.UOM           || "",
				ItemNetPrice:   String(n(o.ItemNetPrice).toFixed(2)),
				SentQuantity:   n(o.SentQuantity),
				BalanceQuantity: n(o.BalanceQuantity),
				SOQuantity:     n(o.SOQuantity),
				OpenQuantity:   n(o.OpenQuantity),
				Totalvalue:     n(o.Totalvalue),
				OriginalGPNo:   o.OriginalGPNo  || "",
				Remarks:        o.Remarks       || ""
			};
		},

		/**
		 * Formats status code to human-readable string.
		 */
		formatStatus: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			return this._deriveStatus({
				Status: sStatus,
				Approval1: sApproval1,
				Approval2: sApproval2,
				ApprovalReq: sApprovalReq,
				STORERemarks: sStoreRemarks,
				StoreAmmend: sStoreAmmend
			});
		},

		/**
		 * Returns value state for status text formatting.
		 */
		formatStatusState: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			switch (sDerived) {
				case "Approved": return "Success";
				case "Rejected": return "Error";
				case "Amendment": return "Warning";
				case "HOD approval pending": return "Warning";
				case "Store Approval Pending": return "Information";
				case "Cancelled": return "Error";
				case "Closed": return "None";
				default: return "None";
			}
		},

		_openSortDialog: function (sTableId, aSortItems) {
			var sDialogId = "_sortDialog_" + sTableId;
			if (!this[sDialogId]) {
				var sapM = sap.ui.require("sap/m/ViewSettingsDialog");
				var sapItem = sap.ui.require("sap/m/ViewSettingsItem");
				var that = this;
				this[sDialogId] = new sapM({
					confirm: function (oEvent) {
						var oSortItem = oEvent.getParameter("sortItem");
						var bDescending = oEvent.getParameter("sortDescending");
						var aSorters = [];
						if (oSortItem) {
							var fnComparator = function(a, b) {
								if (a === b) return 0;
								if (a === null || a === undefined || a === "") return -1;
								if (b === null || b === undefined || b === "") return 1;

								var strA = String(a).trim();
								var strB = String(b).trim();

								// Numeric check
								if (!isNaN(strA) && !isNaN(strB) && strA !== "" && strB !== "") {
									return Number(strA) - Number(strB);
								}

								// Date check: formats DD-MM-YYYY, YYYY-MM-DD
								var regexDDMMYYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
								var regexYYYYMMDD = /^(\d{4})-(\d{2})-(\d{2})$/;

								var d1 = null, d2 = null;
								var m1 = strA.match(regexDDMMYYYY);
								var m2 = strB.match(regexDDMMYYYY);
								if (m1 && m2) {
									d1 = new Date(m1[3], m1[2] - 1, m1[1]);
									d2 = new Date(m2[3], m2[2] - 1, m2[1]);
								} else {
									m1 = strA.match(regexYYYYMMDD);
									m2 = strB.match(regexYYYYMMDD);
									if (m1 && m2) {
										d1 = new Date(m1[1], m1[2] - 1, m1[3]);
										d2 = new Date(m2[1], m2[2] - 1, m2[3]);
									}
								}
								if (d1 && d2 && !isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
									return d1.getTime() - d2.getTime();
								}

								// Fallback string compare
								return strA.localeCompare(strB);
							};
							aSorters.push(new sap.ui.model.Sorter(oSortItem.getKey(), bDescending, false, fnComparator));
						}
						var oTable = that.getView().byId(sTableId);
						if (oTable) {
							var oBinding = oTable.getBinding("items");
							if (oBinding) {
								oBinding.sort(aSorters);
							}
						}
					}
				});
				aSortItems.forEach(function (itm) {
					that[sDialogId].addSortItem(new sapItem({ key: itm.key, text: itm.text, selected: !!itm.selected }));
				});
				/** @type {sap.ui.core.Element} */
				var oDependent = this[sDialogId];
				this.getView().addDependent(oDependent);
			}
			this[sDialogId].open();
		},

		onColumnHeaderSort: function (oEvent) {
			var oButton = oEvent.getSource();
			var sSortKey = oButton.data("sortKey");
			var sTableId = oButton.data("tableName");
			if (!sSortKey || !sTableId) return;

			// Initialize sortModel if not exists
			var oView = this.getView();
			var oSortModel = oView.getModel("sortModel");
			if (!oSortModel) {
				oSortModel = new sap.ui.model.json.JSONModel({});
				oView.setModel(oSortModel, "sortModel");
			}

			// Determine new sort direction
			var sCurrentDir = oSortModel.getProperty("/" + sSortKey);
			var sNewDir = "Asc";
			if (sCurrentDir === "Asc") sNewDir = "Desc";
			else if (sCurrentDir === "Desc") sNewDir = "None";

			// Clear all previous sort states
			oSortModel.setData({});
			if (sNewDir !== "None") {
				oSortModel.setProperty("/" + sSortKey, sNewDir);
			}

			var aSorters = [];
			if (sNewDir !== "None") {
				var bDescending = (sNewDir === "Desc");
				var fnComparator = function (a, b) {
					if (a === b) return 0;
					
					var emptyA = (a === null || a === undefined || a === "");
					var emptyB = (b === null || b === undefined || b === "");
					if (emptyA && emptyB) return 0;
					// Always put empty values at the bottom
					if (emptyA) return bDescending ? -1 : 1;
					if (emptyB) return bDescending ? 1 : -1;

					if (a instanceof Date && b instanceof Date) {
						return a.getTime() - b.getTime();
					}
					if (a instanceof Date) return bDescending ? -1 : 1;
					if (b instanceof Date) return bDescending ? -1 : 1;

					var strA = String(a).trim();
					var strB = String(b).trim();
					
					if (!isNaN(strA) && !isNaN(strB) && strA !== "" && strB !== "") {
						return Number(strA) - Number(strB);
					}

					var regexDDMMYYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
					var regexYYYYMMDD = /^(\d{4})-(\d{2})-(\d{2})$/;
					var d1 = null, d2 = null;
					var m1 = strA.match(regexDDMMYYYY), m2 = strB.match(regexDDMMYYYY);
					if (m1 && m2) { 
						d1 = new Date(m1[3], m1[2] - 1, m1[1]); 
						d2 = new Date(m2[3], m2[2] - 1, m2[1]); 
					} else {
						m1 = strA.match(regexYYYYMMDD); m2 = strB.match(regexYYYYMMDD);
						if (m1 && m2) { 
							d1 = new Date(m1[1], m1[2] - 1, m1[3]); 
							d2 = new Date(m2[1], m2[2] - 1, m2[3]); 
						}
					}
					if (d1 && d2 && !isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
						return d1.getTime() - d2.getTime();
					}
					
					return strA.localeCompare(strB);
				};
				aSorters.push(new sap.ui.model.Sorter(sSortKey, bDescending, false, fnComparator));
			}

			var oTable = oView.byId(sTableId) || sap.ui.core.Fragment.byId(oView.getId(), sTableId);
			if (!oTable && oButton) {
				var oParent = oButton.getParent();
				while (oParent && !oTable) {
					if (oParent.getMetadata && oParent.getMetadata().getName() === "sap.m.Table") {
						oTable = oParent;
					} else {
						oParent = oParent.getParent ? oParent.getParent() : null;
					}
				}
			}
			if (oTable) {
				var oBinding = oTable.getBinding("items");
				if (oBinding) {
					oBinding.sort(aSorters);
				}
			}
		}
	});

});