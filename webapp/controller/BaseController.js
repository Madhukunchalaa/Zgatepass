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
				SalesDocument: o.SalesDocument || "",
				GatePasstype: o.GatePasstype || "NRGP",
				ItemNo: o.ItemNo || "",
				Material: o.Material || "",
				MaterialDescription: o.MaterialDescription || "",
				HSNCode: o.HSNCode || "",
				UOM: o.UOM || "",
				// Edm.Decimal fields must be sent as STRING values — the Gateway JSON
				// deserializer rejects unquoted numbers ("Failed to read property
				// 'Totalvalue'"); read responses also return "45.000"-style strings.
				ItemNetPrice: n(o.ItemNetPrice).toFixed(2),
				Totalvalue: n(o.Totalvalue).toFixed(2),
				GatePassNo: o.GatePassNo || "",
				GatePassReqNo: o.GatePassReqNo || "",
				SentQuantity: n(o.SentQuantity).toFixed(3),
				BalanceQuantity: n(o.BalanceQuantity).toFixed(3),
				SOQuantity: n(o.SOQuantity).toFixed(3),
				OpenQuantity: n(o.OpenQuantity).toFixed(3),
				RequestedQuantity: n(o.RequestedQuantity || o.SOQuantity || o.SentQuantity).toFixed(3)
			};
		},

		/**
		 * Rebuilds a create/update payload so it matches what the backend entity
		 * actually declares in $metadata: properties the entity type no longer has
		 * are dropped, and every value is serialised per its Edm type (Decimal →
		 * string with the declared scale, Double/Single → number, Int64 → string,
		 * Int16/32 → integer). Shields the UI from ABAP structure/type changes,
		 * e.g. "Property 'RequestedQuantity' is invalid" after a DDIC retype.
		 * The entity type is auto-detected as the one with the highest overlap
		 * with the payload's property names.
		 */
		_typePayloadForEntity: function (oODataModel, oPayload) {
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
				if (Array.isArray(v)) { oTyped[k] = v; return; } // nav properties pass through
				var oProp = oBestProps[k];
				if (!oProp) {
					// Backend entity no longer declares this property — sending it
					// would raise "Property 'k' is invalid", so drop it.
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
				this.getView().addDependent(this[sDialogId]);
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
					if (b instanceof Date) return bDescending ? 1 : -1;

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
			if (oTable) {
				var oBinding = oTable.getBinding("items");
				if (oBinding) {
					oBinding.sort(aSorters);
				}
			}
		}
	});

});