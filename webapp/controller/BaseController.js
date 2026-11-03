sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (Controller, UIComponent, MessageBox, MessageToast) {
	"use strict";

	return Controller.extend("zgpms.meilpower.com.controller.BaseController", {

		/**
		 * Convenience method for getting the logged-in user's plant.
		 * Reads from the global "user" model with fallback to localStorage.
		 * @public
		 * @returns {string} active plant code (e.g. "2301", "3120", "3121")
		 */
		getUserPlant: function () {
			var oUserModel = sap.ui.getCore().getModel("user") || (this.getOwnerComponent() && this.getOwnerComponent().getModel("user"));
			var sPlant = oUserModel ? (oUserModel.getProperty("/Plant") || oUserModel.getProperty("/plant")) : "";
			if (!sPlant) {
				try {
					var sSaved = localStorage.getItem("gpms_user");
					if (sSaved) {
						var oParsed = JSON.parse(sSaved);
						sPlant = oParsed.Plant || oParsed.plant || "";
					}
				} catch (e) {}
			}
			return sPlant || "";
		},

		/**
		 * Helper to append a Plant filter to an existing filter array if not already present.
		 * @public
		 * @param {Array} aFilters array of sap.ui.model.Filter objects
		 * @param {string} [sFieldName="Plant"] OData property name for plant
		 * @returns {Array} updated filter array
		 */
		addPlantFilter: function (aFilters, sFieldName) {
			aFilters = aFilters || [];
			var sPlant = this.getUserPlant();
			var sField = sFieldName || "Plant";
			if (sPlant) {
				var bExists = aFilters.some(function (f) {
					var p = (f.sPath || f._sPath || "").toLowerCase();
					return p === sField.toLowerCase() || p === "plant" || p === "zwerks";
				});
				if (!bExists) {
					aFilters.push(new sap.ui.model.Filter(sField, sap.ui.model.FilterOperator.EQ, sPlant));
				}
			}
			return aFilters;
		},

		/**
		 * Checks if an item record matches the given plant code.
		 * Checks direct plant properties (Plant, Werks, zwerks) first.
		 * If not found or empty, checks document number prefixes (GatepassNo, GatePassReqNo, GateEntryNo, PCPNo, etc.).
		 * @public
		 * @param {object} oItem
		 * @param {string} [sTargetPlant] default to logged-in user plant
		 * @returns {boolean}
		 */
		isPlantMatch: function (oItem, sTargetPlant) {
			if (!oItem) { return false; }
			var sPlant = (sTargetPlant || this.getUserPlant() || "").trim();
			if (!sPlant) { return true; }

			var sItemPlant = String(oItem.Plant || oItem.Werks || oItem.zwerks || oItem.Zwerks || oItem.PlantCode || "").trim();
			if (sItemPlant) {
				return sItemPlant === sPlant;
			}

			// Fallback: check 4-digit plant prefix on document numbers (e.g. 2301..., 3120..., 3121...)
			var aDocFields = [
				oItem.GatepassNo,
				oItem.GatePassNo,
				oItem.GatePassReqNo,
				oItem.GatePassreqNo,
				oItem.GateEntryNo,
				oItem.PCPNO,
				oItem.PCPNo,
				oItem.Zreqnumber,
				oItem.zreqnumber,
				oItem.PurchaseOrder,
				oItem.EBELN,
				oItem.Ebeln
			];
			for (var i = 0; i < aDocFields.length; i++) {
				var sVal = String(aDocFields[i] || "").trim();
				if (sVal.length >= 4) {
					var sPrefix = sVal.substring(0, 4);
					if (sPrefix === "2301" || sPrefix === "3120" || sPrefix === "3121" || sPrefix === "2121") {
						return sPrefix === sPlant;
					}
				}
			}

			return true;
		},

		/**
		 * Filters an array of results by the active plant.
		 * @public
		 * @param {Array} aList
		 * @param {string} [sTargetPlant]
		 * @returns {Array}
		 */
		filterResultsByPlant: function (aList, sTargetPlant) {
			if (!Array.isArray(aList)) { return []; }
			var sPlant = (sTargetPlant || this.getUserPlant() || "").trim();
			if (!sPlant) { return aList; }
			var that = this;
			return aList.filter(function (oItem) {
				return that.isPlantMatch(oItem, sPlant);
			});
		},

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
		 * Supports DD-MM-YYYY, DD-MMM-YYYY, YYYY-MM-DD, and Date objects.
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
			var MONTHS_MAP = { JAN:"01", FEB:"02", MAR:"03", APR:"04", MAY:"05", JUN:"06", JUL:"07", AUG:"08", SEP:"09", OCT:"10", NOV:"11", DEC:"12" };
			var aParts = String(sDisplayDate).trim().split("-");
			if (aParts.length === 3 && aParts[2].length === 4) {
				var mStr = isNaN(aParts[1]) ? (MONTHS_MAP[aParts[1].toUpperCase()] || aParts[1]) : String(aParts[1]).padStart(2, '0');
				return aParts[2] + mStr + String(aParts[0]).padStart(2, '0');
			}
			if (aParts.length === 3 && aParts[0].length === 4) {
				var mStr2 = isNaN(aParts[1]) ? (MONTHS_MAP[aParts[1].toUpperCase()] || aParts[1]) : String(aParts[1]).padStart(2, '0');
				return aParts[0] + mStr2 + String(aParts[2]).padStart(2, '0');
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
		 * into DD-MMM-YYYY string for display (e.g. 07-Oct-2026). Returns "" for null/empty/invalid input.
		 */
		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "" || vDate === "null" || vDate === "undefined") { return ""; }
			var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
			var MONTHS_MAP = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

			var toDDMMMYYYY = function (d) {
				if (!d || isNaN(d.getTime())) return "";
				var dd = String(d.getDate()).padStart(2, "0");
				var mmm = MONTHS[d.getMonth()];
				var yyyy = d.getFullYear();
				return dd + "-" + mmm + "-" + yyyy;
			};

			if (vDate instanceof Date) {
				return toDDMMMYYYY(vDate);
			}

			if (typeof vDate === "string") {
				var sClean = vDate.trim();
				if (!sClean || sClean === "00000000" || sClean === "0000-00-00" || sClean === "00-00-0000") return "";

				// Already in DD-MMM-YYYY? (e.g. 07-Oct-2026)
				var mAlready = sClean.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
				if (mAlready) {
					var capMMM = mAlready[2].charAt(0).toUpperCase() + mAlready[2].slice(1).toLowerCase();
					return mAlready[1] + "-" + capMMM + "-" + mAlready[3];
				}

				// 8-digit YYYYMMDD (e.g. 20261007)
				if (/^\d{8}$/.test(sClean)) {
					var d8 = new Date(parseInt(sClean.slice(0, 4), 10), parseInt(sClean.slice(4, 6), 10) - 1, parseInt(sClean.slice(6, 8), 10));
					return toDDMMMYYYY(d8);
				}

				// OData /Date(123456789)/
				if (sClean.indexOf("/Date(") !== -1) {
					var ms = parseInt(sClean.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
					if (!isNaN(ms)) {
						return toDDMMMYYYY(new Date(ms));
					}
				}

				// ISO or hyphen/slash delimited
				var sNorm = sClean.split("T")[0].replace(/\//g, "-");
				var aParts = sNorm.split("-");
				if (aParts.length === 3) {
					if (aParts[0].length === 4) {
						// YYYY-MM-DD
						var dY = new Date(parseInt(aParts[0], 10), parseInt(aParts[1], 10) - 1, parseInt(aParts[2], 10));
						return toDDMMMYYYY(dY);
					}
					if (aParts[2].length === 4) {
						// DD-MM-YYYY or DD-MMM-YYYY
						var mIndex = isNaN(aParts[1]) ? MONTHS_MAP[aParts[1].toUpperCase()] : (parseInt(aParts[1], 10) - 1);
						if (mIndex !== undefined && !isNaN(mIndex)) {
							var dD = new Date(parseInt(aParts[2], 10), mIndex, parseInt(aParts[0], 10));
							return toDDMMMYYYY(dD);
						}
					}
				}

				var dParsed = new Date(sClean);
				if (!isNaN(dParsed.getTime())) {
					return toDDMMMYYYY(dParsed);
				}
			}

			return String(vDate || "");
		},

		/**
		 * Formats to DD-MMM-YYYY for list and print views.
		 */
		_formatDateSlash: function (vDate) {
			return this._formatDate(vDate);
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
				GatePassNo:          o.GatePassNo || "",
				GatePassReqNo:       o.GatePassReqNo || "",
				SalesDocument:       o.SalesDocument || "",
				GatePasstype:        o.GatePasstype || o.GatePassType || "NRGP",
				ItemNo:              o.ItemNo || "",
				Material:            o.Material || "",
				MaterialDescription: o.MaterialDescription || o.MaterialDesc || "",
				HSNCode:             o.HSNCode || "",
				UOM:                 o.UOM || "",
				ItemNetPrice:        String(n(o.ItemNetPrice).toFixed(2)),
				SentQuantity:        n(o.SentQuantity),
				BalanceQuantity:     n(o.BalanceQuantity),
				SOQuantity:          n(o.SOQuantity),
				OpenQuantity:        n(o.OpenQuantity),
				Totalvalue:          n(o.Totalvalue),
				Remarks:             o.Remarks || ""
			};
		},
		getBundleTextByModel: function (sI18nKey, oResourceModel, aPlaceholderValues) {
			return oResourceModel.getResourceBundle().then(function (oBundle) {
				return oBundle.getText(sI18nKey, aPlaceholderValues);
			});
		},

		/**
		 * Coerces payload properties to match the OData metadata EDMX types.
		 */
		_typePayloadForEntity: function (oODataModel, oPayload) {
			if (!oPayload) { return oPayload; }
			var oMeta = oODataModel && oODataModel.getServiceMetadata && oODataModel.getServiceMetadata();
			if (!oMeta || !oMeta.dataServices) { return oPayload; }

			var aKeys = Object.keys(oPayload).filter(function (k) {
				return oPayload[k] !== undefined && !Array.isArray(oPayload[k]);
			});

			var oBestProps = null, iBestScore = 0;
			(oMeta.dataServices.schema || []).forEach(function (oSchema) {
				(oSchema.entityType || []).forEach(function (oType) {
					var mProps = {};
					(oType.property || []).forEach(function (p) { mProps[p.name] = p; });
					var iScore = aKeys.reduce(function (n, k) { return n + (mProps[k] ? 1 : 0); }, 0);
					if (iScore > iBestScore) { iBestScore = iScore; oBestProps = mProps; }
				});
			});
			if (!oBestProps) { return oPayload; }

			var oTyped = {};
			Object.keys(oPayload).forEach(function (k) {
				var v = oPayload[k];
				if (Array.isArray(v)) { oTyped[k] = v; return; }
				var oProp = oBestProps[k];
				if (!oProp) {
					return;
				}
				switch (oProp.type) {
					case "Edm.Decimal": {
						var fDec = parseFloat(v) || 0;
						var iScale = parseInt(oProp.scale, 10);
						oTyped[k] = isNaN(iScale) ? String(fDec) : fDec.toFixed(Math.min(iScale, 3));
						break;
					}
					case "Edm.Double":
					case "Edm.Single":
						oTyped[k] = parseFloat(v) || 0;
						break;
					case "Edm.Int16":
					case "Edm.Int32":
					case "Edm.Byte":
					case "Edm.SByte":
						oTyped[k] = Math.round(parseFloat(v) || 0);
						break;
					case "Edm.Int64":
						oTyped[k] = String(Math.round(parseFloat(v) || 0));
						break;
					default:
						oTyped[k] = (v === null || v === undefined) ? "" : v;
				}
			});
			return oTyped;
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

								// Date check: formats DD-MMM-YYYY, DD-MM-YYYY, YYYY-MM-DD
								var regexDDMMMYYYY = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/;
								var regexDDMMYYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
								var regexYYYYMMDD = /^(\d{4})-(\d{2})-(\d{2})$/;
								var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };

								var parseDateStr = function (s) {
									var m = s.match(regexDDMMMYYYY);
									if (m) {
										var mon = MONTHS_MAP[m[2].toUpperCase()];
										if (mon !== undefined) return new Date(parseInt(m[3], 10), mon, parseInt(m[1], 10));
									}
									m = s.match(regexDDMMYYYY);
									if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
									m = s.match(regexYYYYMMDD);
									if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
									return null;
								};

								var d1 = parseDateStr(strA);
								var d2 = parseDateStr(strB);
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
					
					var emptyA = (a === null || a === undefined || a === "" || a === "NA" || a === "-");
					var emptyB = (b === null || b === undefined || b === "" || b === "NA" || b === "-");
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

					var regexDDMMMYYYY = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/;
					var regexDDMMYYYY = /^(\d{2})-(\d{2})-(\d{4})$/;
					var regexYYYYMMDD = /^(\d{4})-(\d{2})-(\d{2})$/;
					var MONTHS_MAP = { JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5, JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11 };

					var parseDateStr = function (s) {
						var m = s.match(regexDDMMMYYYY);
						if (m) {
							var mon = MONTHS_MAP[m[2].toUpperCase()];
							if (mon !== undefined) return new Date(parseInt(m[3], 10), mon, parseInt(m[1], 10));
						}
						m = s.match(regexDDMMYYYY);
						if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
						m = s.match(regexYYYYMMDD);
						if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
						return null;
					};

					var d1 = parseDateStr(strA);
					var d2 = parseDateStr(strB);
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