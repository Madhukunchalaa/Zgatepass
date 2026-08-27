sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.NRGPList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "nrgpList");
			this.getRouter().getRoute("NRGPList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			if (oUserModel && oUserModel.getProperty("/IsGatepassUserOnly")) {
				sap.m.MessageBox.error("You do not have authorization to access the Gate Pass List screen.");
				this.getRouter().navTo("home");
				return;
			}
			this.getView().getModel("nrgpList").setProperty("/items", []);
			this._loadData();
		},

		_loadData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			var iTarget = 3;

			// Helper to refresh rendered table rows once vendor lookup finishes asynchronously
			var fnUpdateVendorNamesInModel = function () {
				var oModel = that.getView().getModel("nrgpList");
				if (!oModel) return;
				var aItems = oModel.getProperty("/items") || [];
				var bUpdated = false;
				aItems.forEach(function (itm) {
					var sReqKey = String(itm.GatePassreqNo || itm.PurchaseOrder || "").trim();
					var sCodeKey = String(itm.Vendor || "").trim();
					var sResolved = (that._mReqVendorMap && that._mReqVendorMap[sReqKey]) ||
					                (that._mVendorMap && that._mVendorMap[sCodeKey]);
					if (sResolved && (!itm.VendorName || itm.VendorName === itm.Vendor)) {
						itm.VendorName = sResolved;
						bUpdated = true;
					}
				});
				if (bUpdated) {
					oModel.refresh(true);
				}
			};

			// 1. Vendor Master lookup map (by Vendor Code filtered by Plant e.g. 2300)
			if (!this._mVendorMap) {
				this._mVendorMap = {};
				var aPlantsToQuery = ["2300", "1000", "2000"]; // Common plants
				aPlantsToQuery.forEach(function (sPlant) {
					oODataModel.read("/ZVendorSet", {
						filters: [new Filter("Plant", FilterOperator.EQ, sPlant)],
						success: function (oVendorData) {
							(oVendorData.results || []).forEach(function (v) {
								var sCode = String(v.Vendor || v.Lifnr || "").trim();
								var sName = String(v.Name || v.VendorName || v.Name1 || "").trim();
								if (sCode && sName) {
									that._mVendorMap[sCode] = sName;
								}
							});
							fnUpdateVendorNamesInModel();
						}
					});
				});
			}

			// 2. Request Header lookup map (by GatePassReqNo - filtered by GatePassType and Status='All')
			if (!this._mReqVendorMap) {
				this._mReqVendorMap = {};
				["NRGP", "RGP", "PO"].forEach(function (sTypeKey) {
					oODataModel.read("/GateReqHdrSet", {
						filters: [
							new Filter("GatePassType", FilterOperator.EQ, sTypeKey),
							new Filter("Status", FilterOperator.EQ, "All")
						],
						success: function (oReqData) {
							(oReqData.results || []).forEach(function (r) {
								var sReqNo = String(r.GatePassReqNo || r.GatePassreqNo || "").trim();
								var sVendorName = String(r.VendorName || r.VendorDesc || r.Name1 || "").trim();
								if (sReqNo && sVendorName) {
									that._mReqVendorMap[sReqNo] = sVendorName;
								}
							});
							fnUpdateVendorNamesInModel();
						}
					});
				});
			}

			var mVendorMap = this._mVendorMap || {};
			var mReqVendorMap = this._mReqVendorMap || {};

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					that.getView().getModel("nrgpList").setProperty("/items", aAllResults);
					that._updateCount();
				}
			}

			function mapItems(oData) {
				return (oData.results || []).map(function (oItem) {
					var sRawStatus = oItem.GPStatus || "";
					var sDisplayStatus = sRawStatus;
					if (oItem.GatePassType === "RGP" && sRawStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") {
						sDisplayStatus = "Awaiting for Return";
					}

					var fnGetDateProp = function (o, aKeys) {
						if (!o) return "";
						for (var k = 0; k < aKeys.length; k++) {
							var val = o[aKeys[k]];
							if (val && val !== "00000000" && val !== "0000-00-00" && val !== "null" && val !== "undefined" && String(val).trim() !== "") {
								return val;
							}
						}
						return "";
					};
					var sRawDue = fnGetDateProp(oItem, ["ReturnableDate", "Returnabledate", "DueDate", "RetDate", "TargetDate", "ReturnDate"]);
					var sRawRet = fnGetDateProp(oItem, ["ExtReturnDate", "Extreturndate", "ExtendedReturnableDate", "ExtReturnableDate", "ActualReturnDate"]);

					if ((!sRawDue || !sRawRet) && (oItem.GatePassNo || oItem.GatePassReqNo || oItem.GatePassreqNo)) {
						try {
							var sKeyNo = String(oItem.GatePassNo || oItem.GatePassReqNo || oItem.GatePassreqNo).trim();
							var sLocalLog = localStorage.getItem("logistics_" + sKeyNo);
							if (sLocalLog) {
								var oParsed = JSON.parse(sLocalLog);
								if (!sRawDue && oParsed.ReturnableDate) sRawDue = oParsed.ReturnableDate;
								if (!sRawRet && oParsed.ExtendedReturnableDate) sRawRet = oParsed.ExtendedReturnableDate;
							}
						} catch (e) { }
					}

					var sReqNo = String(oItem.GatePassReqNo || oItem.GatePassreqNo || "").trim();
					var sVendorCode = String(oItem.Vendor || "").trim();
					var sVendorName = oItem.VendorName || oItem.VendorDesc || oItem.Name1 || mReqVendorMap[sReqNo] || mVendorMap[sVendorCode] || oItem.Vendor || "";

					return {
						GatePassNo: oItem.GatePassNo || "",
						GatePassreqNo: sReqNo,
						GatePassDate: that._formatDate(oItem.GatePassDate),
						GatePassType: oItem.GatePassType,
						Plant: oItem.Plant,
						Department: oItem.Department,
						VendorGST: oItem.VendorGST,
						City: oItem.City,
						VehicleNo: oItem.VehicleNo,
						GPStatus: sRawStatus,
						GPStatusText: sDisplayStatus,
						StatusState: that._getStatusState(sRawStatus),
						NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
						OutgateNav: oItem.OutgateNav || null,
						VendorName: sVendorName,
						Vendor: oItem.Vendor || "",
						ZipCode: oItem.ZipCode || "",
						LRNumber: oItem.LRNumber || "",
						ModeOfDispatch: oItem.ModeOfDispatch || "",
						TransporterName: oItem.TransporterName || "",
						TransporterGST: oItem.TransporterGST || "",
						ChallanNumber: oItem.ChallanNumber || "",
						ChallanDate: oItem.ChallanDate || "",
						CommonDesc: oItem.CommonDesc || "",
						Requestor: (function() {
							var sVal = oItem.ReqUser || oItem.Requser || oItem.requser || oItem.Requestor || oItem.RequestedUser || oItem.ReqEmpName || oItem.CreatedBy || oItem.Createdby || oItem.Ernam || "";
							if (!sVal && sReqNo) {
								try { sVal = localStorage.getItem("requser_" + sReqNo) || ""; } catch (e) {}
							}
							if (!sVal) {
								var oU = sap.ui.getCore().getModel("user");
								if (oU && oU.getProperty("/Username")) { sVal = oU.getProperty("/Username"); }
							}
							return sVal;
						})(),
						ReqUser: oItem.ReqUser || oItem.Requser || oItem.requser || oItem.Requestor || "",
						NoOfPacakages: oItem.NoOfPacakages || "",
						Remarks: oItem.Remarks || "",
						InsuranceReq: oItem.InsuranceReq || "",
						InsuranceDate: oItem.InsuranceDate || "",
						InsuranceAmount: oItem.InsuranceAmount || "",
						FiscalYear: oItem.FiscalYear || "",
						DueDate: sRawDue ? that._formatDate(sRawDue) : "-",
						ReturnDate: sRawRet ? that._formatDate(sRawRet) : "-"
					};
				});
			}

			sap.ui.core.BusyIndicator.show(0);

			// 1. Fetch NRGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 2. Fetch RGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 3. Fetch PO Gate Passes from OutGatePassSet (filtered by GatePassType eq 'PO')
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "PO")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aPoResults = (oData.results || []).map(function (oItem) {
						var sReqNo = String(oItem.GatePassReqNo || oItem.GatePassreqNo || "").trim();
						var sVendorCode = String(oItem.Vendor || "").trim();
						var sVendorName = oItem.VendorName || oItem.VendorDesc || oItem.Name1 || mReqVendorMap[sReqNo] || mVendorMap[sVendorCode] || oItem.Vendor || "";
						return {
							GatePassNo: oItem.GatePassNo || "",
							GatePassreqNo: sReqNo,
							PurchaseOrder: sReqNo, // Store the PO number for the detail dialog
							GatePassDate: that._formatDate(oItem.GatePassDate),
							GatePassType: "PO",
							Plant: oItem.Plant || "",
							Department: oItem.Department || "",
							VendorGST: oItem.VendorGST || "", // Vendor Code / GST
							City: oItem.City || "",
							VehicleNo: oItem.VehicleNo || "",
							GPStatus: oItem.GPStatus || "Pending",
							StatusState: that._getStatusState(oItem.GPStatus || "Pending"),
							NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
							OutgateNav: oItem.OutgateNav || null,
							VendorName: sVendorName,
							Vendor: oItem.Vendor || "",
							ZipCode: oItem.ZipCode || "",
							LRNumber: oItem.LRNumber || "",
							ModeOfDispatch: oItem.ModeOfDispatch || "",
							TransporterName: oItem.TransporterName || "",
							TransporterGST: oItem.TransporterGST || "",
							ChallanNumber: oItem.ChallanNumber || "",
							ChallanDate: oItem.ChallanDate || "",
							CommonDesc: oItem.CommonDesc || "",
							NoOfPacakages: oItem.NoOfPacakages || "",
							Remarks: oItem.Remarks || "",
							InsuranceReq: oItem.InsuranceReq || "",
							InsuranceDate: oItem.InsuranceDate || "",
							InsuranceAmount: oItem.InsuranceAmount || "",
							FiscalYear: oItem.FiscalYear || "",
							DueDate: "NA",
							ReturnDate: "NA",
							Requestor: oItem.Requestor || ""
						};
					});
					aAllResults = aAllResults.concat(aPoResults);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});
		},


		_getStatusState: function (sStatus) {
			if (sStatus === "CLOSED" || sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A") return "Success";
			if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT" || sStatus === "Pending" || sStatus === "PENDING") return "Warning";
			if (sStatus === "OPEN") return "Information";
			if (sStatus === "Rejected" || sStatus === "REJECTED" || sStatus === "R" || sStatus === "CANCELLED" || sStatus === "Cancelled") return "Error";
			if (sStatus === "AM" || sStatus === "AMENDMENT") return "Error";
			return "None";
		},

		onSearchFieldLiveChange: function () {
			this._applyFilters();
		},

		onSelectFilterChange: function () {
			this._applyFilters();
		},

		onDatePickerChange: function () {
			this._applyFilters();
		},

		onResetButtonPress: function () {
			this.byId("idNRGPSearchField").setValue("");
			this.byId("idNRGPTypeSelect").setSelectedKey("");
			this.byId("idNRGPStatusSelect").setSelectedKey("");
			this.byId("idNRGPFromDatePicker").setValue("");
			this.byId("idNRGPToDatePicker").setValue("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			if (!oBinding) { return; }
			var aFilters = [];

			// ── Search filter: GP No, Req No, Vendor Name, Description, Dept ──
			var sSearch = this.byId("idNRGPSearchField").getValue().trim();
			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "",
					test: function (oValue, oContext) {
						var o = oContext ? oContext.getObject() : oValue;
						if (!o) return false;
						for (var key in o) {
							if (o.hasOwnProperty(key) && o[key] !== null && o[key] !== undefined) {
								if (typeof o[key] === "string" || typeof o[key] === "number" || typeof o[key] === "boolean") {
									if (String(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
								} else if (typeof o[key] === "object") {
									try {
										if (JSON.stringify(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
									} catch (e) {}
								}
							}
						}
						return false;
					}
				}));
			}

			// ── Type filter ──
			var sType = this.byId("idNRGPTypeSelect").getSelectedKey();
			if (sType) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType));
			}

			// ── Status filter (special handling for Awaiting for Return vs Awaiting Ack) ──
			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();
			if (sStatus) {
				if (sStatus === "AWAITING_FOR_RETURN") {
					// RGP records with AWAITING status
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, "AWAITING FOR VENDOR ACKNOWLEDGEMENT"));
					if (!sType) {
						// Only restrict by type if no type filter is already active
						aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "RGP"));
					}
				} else if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") {
					// NRGP records with AWAITING status
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, "AWAITING FOR VENDOR ACKNOWLEDGEMENT"));
					if (!sType) {
						aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
					}
				} else {
					aFilters.push(new Filter("GPStatus", FilterOperator.EQ, sStatus));
				}
			}

			// ── Date filter: GatePassDate is stored as DD-MM-YYYY ──
			var oFromDate = this.byId("idNRGPFromDatePicker").getDateValue();
			var oToDate   = this.byId("idNRGPToDatePicker").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo   = oToDate   ? new Date(oToDate.getFullYear(),   oToDate.getMonth(),   oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "GatePassDate",
					test: function (sDate) {
						if (!sDate) { return false; }
						// Support DD-MM-YYYY
						var p = sDate.split("-");
						if (p.length !== 3) { return false; }
						var dd, mm, yyyy;
						if (p[0].length === 4) {
							// YYYY-MM-DD
							yyyy = parseInt(p[0]); mm = parseInt(p[1]); dd = parseInt(p[2]);
						} else {
							// DD-MM-YYYY
							dd = parseInt(p[0]); mm = parseInt(p[1]); yyyy = parseInt(p[2]);
						}
						var oItem = new Date(yyyy, mm - 1, dd);
						if (oFrom && oItem < oFrom) { return false; }
						if (oTo   && oItem > oTo)   { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			if (oBinding) {
				this.byId("idNRGPCountText").setText(oBinding.getLength() + " Items");
			}
		},

		onDownloadExcel: function () {
			var that = this;
			var oTable = this.byId("idItemsNRGPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			var dFrom = this.byId("idNRGPFromDatePicker").getDateValue();
			var dTo = this.byId("idNRGPToDatePicker").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var sType   = this.byId("idNRGPTypeSelect").getSelectedKey();
			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();

			var aRows = [];

			// ── Detailed format for all filter types (RGP, NRGP, PO, All) ──
			var iSno = 1;
			aObjects.forEach(function (o) {
				var sReqNoKey = o.GatePassNo || o.GatePassreqNo || o.GatePassReqNo || "";
				var oSavedLogistics = {};
				try {
					oSavedLogistics = JSON.parse(localStorage.getItem("gp_logistics_" + sReqNoKey) || "{}");
				} catch (e) {}

				var bInsured = oSavedLogistics.bInsured || oSavedLogistics.InsuranceRequired || (o.InsuranceReq === "X" || o.InsuranceReq === "YES" || o.Insurance === "YES" || o.InsuranceReq === "Y" || o.InsuranceReq === "1");
				var sInsAmount = oSavedLogistics.sInsAmount || oSavedLogistics.InsuranceAmount || o.InsuranceAmount || o.InsuranceValue || "";
				var sInsLRV = oSavedLogistics.sInsLRVehicleNo || oSavedLogistics.OutwardInsLRV || o.OutwardInsLRV || o.InwardInsLRV || o.InwardLRVehicleNo || "";
				var sInsDesc = oSavedLogistics.sInsDescription || oSavedLogistics.OutwardInsDesc || o.OutwardInsDesc || o.InwardInsDesc || o.InwardDescription || "";
				var sInsDate = oSavedLogistics.sInsDate || oSavedLogistics.OutwardInsDate || o.OutwardInsDate || o.InwardInsDate || o.InwardDate || "";
				var sInsVal = oSavedLogistics.sInsValue || oSavedLogistics.OutwardInsValue || o.OutwardInsValue || o.InwardInsValue || o.InwardValue || "";

				var aItems = (o.OutgateNav && o.OutgateNav.results) || (Array.isArray(o.OutgateNav) ? o.OutgateNav : []);
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (itm) {
					aRows.push({
						"Sno":                              iSno++,
						"GP No":                            o.GatePassNo || "",
						"Vendor Name":                      o.VendorName || "",
						"Issue Date":                       that._formatDate(o.GatePassDate || o.CreatedOn),
						"Common Description":               o.CommonDesc || "",
						"Material Description":             itm.MaterialDesc || itm.Description || itm.HSNDesc || "",
						"Qty Send":                         itm.SentQuantity || itm.Quantity || "",
						"Uom":                              itm.UOM || "",
						"HSN Code":                         itm.HSNCode || "",
						"Qty Received":                     itm.RecievedQuantity || "",
						"Balance Qty":                      itm.BalanceQuantity || "",
						"Due Date":                         that._formatDate(o.DueDate || o.ReturnableDate),
						"Extend Due Date":                  that._formatDate(o.ReturnDate || o.ExtReturnDate),
						"Returned Date":                    that._formatDate(o.ReturnedDate),
						"UOP":                              itm.ItemNetPrice || "",
						"Amount":                           itm.ItemNetPrice || "",
						"Total Value":                      itm.Totalvalue || "",
						"DC No":                            o.ChallanNumber || "",
						"DC/DF Notes":                      o.CommonDesc || "",
						"LR Number":                        o.LRNumber || o.LRNnumber || "",
						"Vehicle No":                       o.VehicleNo || "",
						"EWB No":                           o.EWBNo || o.EWBno || o.EwbNo || "",
						"Transport Name":                   o.TransporterName || "",
						"Transporter GST":                  o.TransporterGST || "",
						"Insurance Yes/ No":                bInsured ? "YES" : "NO",
						"Insurance Value":                  sInsAmount,
						"Outward Insurance LR/Vehicle No":   sInsLRV,
						"Outward Insurance Description":     sInsDesc,
						"Outward Insurance Date":            that._formatDate(sInsDate),
						"Outward Insurance Value":           sInsVal,
						"GP Req No":                        o.GatePassReqNo || o.GatePassreqNo || "",
						"Requested User":                   o.Requestor || o.ReqUser || o.RequestedUser || o.ReqEmpName || o.CreatedBy || "",
						"Department":                       o.Department || "",
						"User Remarks":                     o.Remarks || "",
						"Dept Remarks":                     o.HODRemarks || "",
						"Store Remarks":                    o.STORERemarks || o.StoreRemarks || "",
						"Status":                           o.GPStatusText || o.GPStatus || ""
					});
				});
			});

			var aParts = ["Out_Gate_Pass"];
			if (sType)   { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom)   { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo)     { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, aRows.length ? Object.keys(aRows[0]).length : 28);
		},

		onPrintList: function () {
			var oTable = this.byId("idItemsNRGPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Out Gate Passes List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Out Gate Passes List</h2><table><thead><tr>";
			sHtml += "<th>GP Date</th><th>GP No.</th><th>GP Req No.</th><th>GP Type</th><th>Due Date</th><th>Ret Date</th><th>Vendor</th><th>Req Dept</th><th>Common Description</th><th>Status</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassDate || "") + "</td>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassreqNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassType || "") + "</td>";
				sHtml += "<td>" + (o.DueDate || "") + "</td>";
				sHtml += "<td>" + (o.ReturnDate || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.Department || "") + "</td>";
				sHtml += "<td>" + (o.CommonDesc || "") + "</td>";
				sHtml += "<td>" + (o.GPStatusText || o.GPStatus || "") + "</td>";
				sHtml += "</tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () { oWindow.print(); oWindow.close(); }, 500);
		},

		onCopyList: function () {
			var oTable = this.byId("idItemsNRGPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["GP Date", "GP No.", "GP Req No.", "GP Type", "Due Date", "Ret Date", "Vendor", "Req Dept", "Common Description", "Status"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				aLines.push([
					o.GatePassDate || "",
					o.GatePassNo || "",
					o.GatePassreqNo || "",
					o.GatePassType || "",
					o.DueDate || "",
					o.ReturnDate || "",
					o.VendorName || "",
					o.Department || "",
					o.CommonDesc || "",
					o.GPStatusText || o.GPStatus || ""
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var el = document.createElement("textarea");
				el.value = sText;
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
				sap.m.MessageToast.show("List copied to clipboard.");
			}
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("nrgpList").getObject();
			this._navigateToDetail(oItem);
		},

		onEditRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("nrgpList").getObject();
			this._navigateToDetail(oItem);
		},

		_navigateToDetail: function (oItem) {
			if (oItem.GatePassType === "PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + oItem.GPStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			if (oItem.GatePassType === "RGP") {
				sap.ui.getCore().setModel(new sap.ui.model.json.JSONModel(oItem), "selectedRGP");
				this.getRouter().navTo("RGPDetail", { gpNo: oItem.GatePassNo });
			} else {
				this.getRouter().navTo("NRGPDetail", { gpNo: oItem.GatePassNo, gpType: oItem.GatePassType });
			}
		},

		onSort: function () {
			this._openSortDialog("idNRGPTable", [
				{ key: "GatePassDate", text: "Date", selected: true },
				{ key: "GatePassNo", text: "Gate Pass No" },
				{ key: "GatePassreqNo", text: "GP Req No" },
				{ key: "GatePassType", text: "GP Type" },
				{ key: "DueDate", text: "Due Date" },
				{ key: "ReturnDate", text: "Ret Date" },
				{ key: "VendorName", text: "Vendor" },
				{ key: "Department", text: "Req Dept" },
				{ key: "CommonDesc", text: "Common Description" },
				{ key: "GPStatusText", text: "Status" }
			]);
		}

	});
});
