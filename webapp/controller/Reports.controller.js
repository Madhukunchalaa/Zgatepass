sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageToast, ExcelExport) {
	"use strict";

	var REPORTS = [
		{ sno: 1,  name: "All RGP Report",              desc: "All Returnable Gate Passes",                    howto: "Select From/To date range. All RGP entries in that period are included.",                     status: "Available" },
		{ sno: 2,  name: "Pending RGP Report",          desc: "RGP with Awaiting Return / Acknowledgement",    howto: "Auto-filtered: only non-CLOSED RGP entries within the selected date range.",                  status: "Available" },
		{ sno: 3,  name: "Closed RGP Report",           desc: "RGP with CLOSED status only",                   howto: "Auto-filtered: only CLOSED RGP entries within the selected date range.",                     status: "Available" },
		{ sno: 4,  name: "All NRGP Report",             desc: "All Non-Returnable Gate Passes",                howto: "Select From/To date range. All NRGP entries in that period are included.",                   status: "Available" },
		{ sno: 5,  name: "All PCP Report",              desc: "Petty Cash Purchase entries with Gate Pass",     howto: "Select From/To date range. PCP entries with assigned gate pass number.",                     status: "Available" },
		{ sno: 6,  name: "All Gate Entry Report",       desc: "All Gate Entries with inspection details",       howto: "Select From/To date range. All gate entries with inspection info.",                          status: "Available" },
		{ sno: 7,  name: "Pending Gate Entry Report",   desc: "Gate Entries without PCP assigned",              howto: "Auto-filtered: gate entries where no PCP number is assigned yet.",                           status: "Available" },
		{ sno: 8,  name: "Pending Inspection Report",   desc: "Entries awaiting inspection completion",         howto: "Auto-filtered: gate entries where inspection is not yet completed.",                         status: "Available" },
		{ sno: 9,  name: "Scrap Stock Inward Report",   desc: "Scrap inward entries",                          howto: "Pending — requires new backend query. Will be available in future update.",                  status: "Pending"   },
		{ sno: 10, name: "Scrap Stock Outward Report",  desc: "Scrap outward entries",                         howto: "Pending — requires new backend query. Will be available in future update.",                  status: "Pending"   },
		{ sno: 11, name: "Current Scrap Stock Report",  desc: "Aggregated scrap stock summary",                howto: "Pending — requires backend aggregation. Will be available in future update.",                status: "Pending"   },
		{ sno: 12, name: "Pending IRGP Report",         desc: "IRGP with open / pending status",               howto: "Auto-filtered: non-CLOSED IRGP entries within the selected date range.",                    status: "Available" },
		{ sno: 13, name: "Complete IRGP Report",        desc: "IRGP with CLOSED status",                       howto: "Auto-filtered: only CLOSED IRGP entries within the selected date range.",                   status: "Available" },
		{ sno: 14, name: "All Insurance Report",        desc: "Insurance details across all gate passes",       howto: "Pending — requires new backend query. Will be available in future update.",                  status: "Pending"   },
		{ sno: 15, name: "Scrap Gatepass Report",       desc: "All Scrap Gate Passes",                         howto: "Select From/To date range. All scrap gate passes in that period.",                          status: "Available" },
		{ sno: 16, name: "Ash Gate Pass Report",        desc: "Ash Gate Passes with vendor & cost details",     howto: "Select From/To date range. All ash gate passes with cost details.",                         status: "Available" }
	];

	var SHEET_DEFS = [
		{ sno: 1,  tab: "1.All RGP Report",              hdr: 37 },
		{ sno: 2,  tab: "2.Pending RGP Report",          hdr: 37 },
		{ sno: 3,  tab: "3.Closed RGP Report",           hdr: 37 },
		{ sno: 4,  tab: "4.All NRGP Report",             hdr: 28 },
		{ sno: 5,  tab: "5.All PCP Report",              hdr: 14 },
		{ sno: 6,  tab: "6.All Gate Entry Report",       hdr: 18 },
		{ sno: 7,  tab: "7.Pending Gate Entry Rpt",      hdr: 18 },
		{ sno: 8,  tab: "8.Pending Inspection Rpt",      hdr: 18 },
		{ sno: 9,  tab: "9.Scrap Stock Inward Rpt",      pending: true },
		{ sno: 10, tab: "10.Scrap Stock Outward Rpt",    pending: true },
		{ sno: 11, tab: "11.Current Scrap Stock Rpt",    pending: true },
		{ sno: 12, tab: "12.Pending IRGP Report",        hdr: 24 },
		{ sno: 13, tab: "13.Complete IRGP Report",       hdr: 24 },
		{ sno: 14, tab: "14.All Insurance Report",       pending: true },
		{ sno: 15, tab: "15.Scrap Gatepass Report",      hdr: 10 },
		{ sno: 16, tab: "16.Ash Gate Pass Report",       hdr: 20 }
	];

	function fmtD(v) {
		if (!v) { return ""; }
		if (v instanceof Date) {
			if (isNaN(v.getTime())) { return ""; }
			return v.getDate().toString().padStart(2, "0") + "-" + (v.getMonth() + 1).toString().padStart(2, "0") + "-" + v.getFullYear();
		}
		if (typeof v === "string") {
			var m = v.match(/\/Date\((\d+)/);
			if (m) { return fmtD(new Date(parseInt(m[1], 10))); }
			if (/^\d{8}$/.test(v) && !/^0+$/.test(v)) {
				return v.slice(6, 8) + "-" + v.slice(4, 6) + "-" + v.slice(0, 4);
			}
			if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
				return v.slice(8, 10) + "-" + v.slice(5, 7) + "-" + v.slice(0, 4);
			}
			var p = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
			if (p) { return v; }
		}
		return String(v);
	}

	return BaseController.extend("zgpms.meilpower.com.controller.Reports", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ reports: REPORTS }), "reportIndex");
			this.getRouter().getRoute("reports").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {},

		onPageReportsNavButtonPress: function () {
			this.getRouter().navTo("home");
		},

		_odata: function () { return this.getOwnerComponent().getModel(); },

		_fd: function (aData, sField, dFrom, dTo) {
			return ExcelExport.filterByDate(aData, sField, dFrom, dTo);
		},

		_resolveUserName: function (sUserIdOrName, oReqHeader) {
			if (oReqHeader && oReqHeader.UserFullName) {
				return String(oReqHeader.UserFullName).trim();
			}
			if (!sUserIdOrName && oReqHeader) {
				sUserIdOrName = oReqHeader.UserFullName || oReqHeader.ReqEmpName || oReqHeader.RequestedUser || oReqHeader.Zrequsername || oReqHeader.Requestor || oReqHeader.ReqUser || oReqHeader.CreatedBy || "";
			}
			if (!sUserIdOrName) { return ""; }
			var sTrimmed = String(sUserIdOrName).trim();
			var sUpper = sTrimmed.toUpperCase();

			if (oReqHeader) {
				var sHeaderEmp = String(oReqHeader.UserFullName || oReqHeader.ReqEmpName || oReqHeader.Zrequsername || "").trim();
				if (sHeaderEmp && sHeaderEmp !== sTrimmed && !/^[A-Z]?\d{2,6}$/i.test(sHeaderEmp)) {
					return sHeaderEmp;
				}
			}

			if (this._mUserMap && this._mUserMap[sUpper]) {
				return this._mUserMap[sUpper];
			}
			try {
				var sLocal = localStorage.getItem("username_" + sUpper) || localStorage.getItem("requser_" + sUpper);
				if (sLocal) { return sLocal; }
			} catch (e) {}

			try {
				var oU = sap.ui.getCore().getModel("user");
				if (oU) {
					var sCurId = String(oU.getProperty("/id") || oU.getProperty("/User") || "").toUpperCase();
					var sCurName = oU.getProperty("/UserFullName") || oU.getProperty("/fullName") || oU.getProperty("/Username");
					if (sCurId === sUpper && sCurName) {
						return sCurName;
					}
				}
			} catch (e) {}

			return sTrimmed;
		},

		// ═══════════════════════════════════════════════════════════════
		//  Generate All Reports — single multi-sheet Excel workbook
		// ═══════════════════════════════════════════════════════════════
		onGenerateAllReportsButtonPress: function () {
			var dFrom = this.byId("idReportFromDatePicker").getDateValue();
			var dTo   = this.byId("idReportToDatePicker").getDateValue();
			var that  = this;
			var oModel = this._odata();

			if (!this._mUserMap) {
				this._mUserMap = {};
				try {
					var sCachedUsers = localStorage.getItem("gpms_user_name_map");
					if (sCachedUsers) { this._mUserMap = JSON.parse(sCachedUsers); }
				} catch (e) {}

				oModel.read("/zdepartuserSet", {
					success: function (oUserData) {
						(oUserData.results || []).forEach(function (u) {
							var sId = String(u.userid || u.Userid || u.UserId || u.Bname || "").trim().toUpperCase();
							var sName = String(u.username || u.Username || u.NameText || u.Name || "").trim();
							if (sId && sName && sId !== sName) {
								that._mUserMap[sId] = sName;
							}
						});
						try {
							localStorage.setItem("gpms_user_name_map", JSON.stringify(that._mUserMap));
						} catch (e) {}
					}
				});
			}

			if (!this._mInwardInsuranceMap) {
				this._mInwardInsuranceMap = {};
				try {
					var sCachedIns = localStorage.getItem("gpms_inward_insurance_map");
					if (sCachedIns) { this._mInwardInsuranceMap = JSON.parse(sCachedIns); }
				} catch (e) {}
			}

			var oData = {};
			var iTotal = 7;
			var iDone  = 0;

			sap.ui.core.BusyIndicator.show(0);

			function done() {
				iDone++;
				if (iDone < iTotal) { return; }
				sap.ui.core.BusyIndicator.hide();
				that._assembleWorkbook(oData, dFrom, dTo);
			}

			// ── Fetch 0: Inward Insurance lookup ──
			oModel.read("/ZInwardInsuranceSet", {
				success: function (r) {
					(r.results || []).forEach(function (ins) {
						var sInv = String(ins.InvoiceNumber || "").trim();
						if (sInv) { that._mInwardInsuranceMap[sInv] = ins; }
					});
					try {
						localStorage.setItem("gpms_inward_insurance_map", JSON.stringify(that._mInwardInsuranceMap));
					} catch (e) {}
					done();
				},
				error: function () { done(); }
			});

			// ── Fetch 1: RGP → sheets 1, 2, 3 ──
			oModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (r) {
					var a = r.results || [];
					oData[1] = that._fd(that._buildRGPRows(a), "Issue Date", dFrom, dTo);
					oData[2] = that._fd(that._buildRGPRows(a.filter(function (o) {
						return (o.GPStatus || "").toUpperCase() !== "CLOSED";
					})), "Issue Date", dFrom, dTo);
					oData[3] = that._fd(that._buildRGPRows(a.filter(function (o) {
						return (o.GPStatus || "").toUpperCase() === "CLOSED";
					})), "Issue Date", dFrom, dTo);
					done();
				},
				error: function () { oData[1] = []; oData[2] = []; oData[3] = []; done(); }
			});

			// ── Fetch 2: NRGP → sheet 4 ──
			oModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (r) {
					oData[4] = that._fd(that._buildNRGPRows(r.results || []), "Issue Date", dFrom, dTo);
					done();
				},
				error: function () { oData[4] = []; done(); }
			});

			// ── Fetch 3: PCP → sheets 5, 6, 7, 8 ──
			var oUser = sap.ui.getCore().getModel("user");
			var sPlant = (oUser && oUser.getProperty("/Plant")) || "";
			var aPF = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			oModel.read("/PCPHdrSet", {
				filters: aPF,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (r) {
					var a = r.results || [];
					oData[5] = that._fd(that._buildPCPRows(a.filter(function (o) { return !!o.GatepassNo; })), "GE Date", dFrom, dTo);
					oData[6] = that._fd(that._buildGateEntryRows(a, null), "GE Date", dFrom, dTo);
					oData[7] = that._fd(that._buildGateEntryRows(a.filter(function (o) { return !o.GatepassNo; }), "PENDING_GE"), "GE Date", dFrom, dTo);
					oData[8] = that._fd(that._buildGateEntryRows(a.filter(function (o) {
						var s = (o.InspectionStatus || "").toUpperCase();
						return s !== "COMPLETED" && s !== "COMPLETE";
					}), "PENDING_INSP"), "GE Date", dFrom, dTo);
					done();
				},
				error: function () { oData[5] = []; oData[6] = []; oData[7] = []; oData[8] = []; done(); }
			});

			// ── Fetch 4: IRGP → sheets 12, 13 ──
			oModel.read("/IRGPHdrSet", {
				urlParameters: { "$expand": "IRGPItmNav" },
				success: function (r) {
					var a = r.results || [];
					oData[12] = that._fd(that._buildIRGPRows(a.filter(function (o) {
						return (o.Status || "").toUpperCase().indexOf("CLOSED") === -1;
					})), "Req Date", dFrom, dTo);
					oData[13] = that._fd(that._buildIRGPRows(a.filter(function (o) {
						return (o.Status || "").toUpperCase().indexOf("CLOSED") !== -1;
					})), "Req Date", dFrom, dTo);
					done();
				},
				error: function () { oData[12] = []; oData[13] = []; done(); }
			});

			// ── Fetch 5: Scrap GP → sheet 15 ──
			oModel.read("/ScrapPassHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "ScrapPassItmNav" },
				success: function (r) {
					oData[15] = that._fd(that._buildScrapRows(r.results || []), "GP Date", dFrom, dTo);
					done();
				},
				error: function () { oData[15] = []; done(); }
			});

			// ── Fetch 6: Ash GP → sheet 16 ──
			oModel.read("/AshHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				success: function (r) {
					oData[16] = that._fd(that._buildAshRows(r.results || []), "Issue Date", dFrom, dTo);
					done();
				},
				error: function () { oData[16] = []; done(); }
			});
		},

		// ═══════════════════════════════════════════════════════════════
		//  Assemble multi-sheet workbook
		// ═══════════════════════════════════════════════════════════════
		_assembleWorkbook: function (oData, dFrom, dTo) {
			var aSheets = [];

			// ── Index sheet ──
			var aIdx = REPORTS.map(function (r, i) {
				return {
					"S.No":            r.sno,
					"Report Name":     r.name,
					"Description":     r.desc,
					"Status":          r.status,
					"How to Download": r.howto,
					"Sheet Name":      SHEET_DEFS[i].tab
				};
			});
			aSheets.push({ name: "REPORT DOWNLOAD", ws: ExcelExport.buildStyledSheet(aIdx, 6) });

			// ── Data sheets ──
			SHEET_DEFS.forEach(function (def) {
				var ws;
				if (def.pending) {
					ws = ExcelExport.buildStyledSheet([{ "Status": "Pending — Requires additional backend integration. Will be available in a future update." }], 1);
				} else {
					var aRows = oData[def.sno] || [];
					if (aRows.length > 0) {
						ws = ExcelExport.buildStyledSheet(aRows, def.hdr);
					} else {
						ws = ExcelExport.buildStyledSheet([{ "Status": "No data found for the selected date range." }], 1);
					}
				}
				aSheets.push({ name: def.tab, ws: ws });
			});

			// ── File name ──
			var aParts = ["GPMS_Reports"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.downloadWorkbook(aSheets, aParts.join("_") + ".xlsx");
		},

		// ═══════════════════════════════════════════════════════════════
		//  Row builders — return flat arrays, no download
		// ═══════════════════════════════════════════════════════════════

		// ── RGP (37 columns) ──
		_buildRGPRows: function (aResults) {
			var aFlat = [];
			var that = this;

			var fnValidDate = function () {
				for (var i = 0; i < arguments.length; i++) {
					var v = arguments[i];
					if (v === null || v === undefined) continue;
					if (v instanceof Date && !isNaN(v.getTime())) {
						return fmtD(v);
					}
					var s = String(v).trim();
					if (!s || s === "-" || s === "00000000" || s === "0000-00-00" || s === "00-00-0000" ||
						s === "null" || s === "undefined" || s === "NA" || s === "N/A" || s === "None") {
						continue;
					}
					var sFmt = fmtD(s);
					if (sFmt && sFmt !== "-" && sFmt !== "00-00-0000" && sFmt !== "00-Jan-0000" && sFmt !== "01-Jan-1970") {
						return sFmt;
					}
				}
				return "";
			};

			var fnValidAmount = function () {
				for (var i = 0; i < arguments.length; i++) {
					var v = arguments[i];
					if (v === null || v === undefined) continue;
					var s = String(v).trim().replace(/,/g, "");
					if (!s || s === "-" || s === "null" || s === "undefined") continue;
					var f = parseFloat(s);
					if (!isNaN(f) && f > 0) {
						return f.toFixed(2);
					}
				}
				return "";
			};

			aResults.forEach(function (o) {
				var sGPKey = String(o.GatePassNo || "").trim();
				var sReqKey = String(o.GatePassreqNo || o.GatePassReqNo || "").trim();
				var oSavedLogistics = {};
				[
					"gp_logistics_" + sGPKey, "logistics_" + sGPKey,
					"gp_logistics_" + sReqKey, "logistics_" + sReqKey
				].forEach(function (k) {
					if (k && !Object.keys(oSavedLogistics).length) {
						try {
							var sVal = localStorage.getItem(k);
							if (sVal) { oSavedLogistics = JSON.parse(sVal); }
						} catch (e) {}
					}
				});

				var oIns = (that._mInwardInsuranceMap && (that._mInwardInsuranceMap[sGPKey] || that._mInwardInsuranceMap[sReqKey])) || {};

				var sInsReqStr = String(o.InsuranceReq || o.Insurance || "").trim().toUpperCase();
				var bInsured = !!(oSavedLogistics.bInsured || oSavedLogistics.InsuranceRequired ||
					sInsReqStr === "X" || sInsReqStr === "YES" || sInsReqStr === "Y" || sInsReqStr === "1" || sInsReqStr === "TRUE" ||
					(oIns && (oIns.InvoiceNumber || oIns.InvoiceValue)));

				var sDueDate = fnValidDate(
					o.ReturnableDate,
					o.DueDate,
					oSavedLogistics.ReturnableDate,
					oSavedLogistics.DueDate,
					o.TargetDate,
					o.RetDate
				) || "-";

				var sExtendDueDate = fnValidDate(
					o.ExtReturnDate,
					o.ExtendedReturnableDate,
					o.Extreturndate,
					oSavedLogistics.ExtendedReturnableDate,
					oSavedLogistics.ExtReturnDate
				);
				if (!sExtendDueDate && o.ReturnDate && o.ReturnDate !== "-" && o.ReturnDate !== o.DueDate && o.ReturnDate !== sDueDate) {
					sExtendDueDate = fnValidDate(o.ReturnDate);
				}
				if (!sExtendDueDate) {
					sExtendDueDate = "-";
				}

				var sReturnedDate = fnValidDate(
					o.ReturnedDate,
					o.ActualReturnDate,
					oIns.RecievedDate,
					oIns.ReceivedDate,
					oSavedLogistics.ReturnedDate,
					oSavedLogistics.ActualReturnDate,
					oSavedLogistics.InwardInsDate,
					o.cdate1,
					((o.GPStatus === "CLOSED") ? oIns.InsuranceDate : null)
				);

				var aItems = (o.OutgateNav && o.OutgateNav.results) || [];
				var sStatus = (o.GPStatus || "").toUpperCase();
				var sDisp = sStatus;
				if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") { sDisp = "AWAIT RETN"; }
				else if (sStatus === "OPEN") { sDisp = "AWAIT ACKN"; }

				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					var fSent = parseFloat(it.SentQuantity || it.Quantity || 0);
					var fRecvd = parseFloat(it.RecievedQuantity || it.ReceivedQuantity || 0);
					var fBal = (it.BalanceQuantity !== undefined && it.BalanceQuantity !== null && String(it.BalanceQuantity).trim() !== "" && parseFloat(it.BalanceQuantity) > 0)
						? parseFloat(it.BalanceQuantity)
						: Math.max(0, parseFloat((fSent - fRecvd).toFixed(3)));

					var fPrice = parseFloat(it.ItemNetPrice || it.NetPrice || it.UnitPrice || it.Price || 0);
					var fQtyVal = fSent > 0 ? fSent : parseFloat(it.Quantity || 1);
					var sCalcItemVal = (fPrice > 0 && fQtyVal > 0) ? (fPrice * fQtyVal).toFixed(2) : "";
					var sItmValStr = fnValidAmount(it.Totalvalue, it.TotalValue, sCalcItemVal);
					var sHdrValStr = fnValidAmount(o.TotalValue, o.Totalvalue);

					var sFinalInsAmount = fnValidAmount(
						oSavedLogistics.sInsAmount,
						oSavedLogistics.InsuranceAmount,
						oIns.InvoiceValue,
						o.InsuranceAmount,
						o.InsuranceValue,
						oSavedLogistics.sInsValue,
						oSavedLogistics.OutwardInsValue,
						sItmValStr,
						sHdrValStr
					);
					if (!sFinalInsAmount) {
						sFinalInsAmount = bInsured ? (sItmValStr || sHdrValStr || "0.00") : "0.00";
					}

					var sFinalOutwardInsVal = fnValidAmount(
						oSavedLogistics.OutwardInsValue,
						oSavedLogistics.sInsValue,
						oIns.InvoiceValue,
						sFinalInsAmount,
						sItmValStr,
						sHdrValStr
					);
					if (!sFinalOutwardInsVal && bInsured) {
						sFinalOutwardInsVal = sFinalInsAmount || sItmValStr || sHdrValStr || "";
					}

					var sFinalOutwardInsDate = fnValidDate(
						oSavedLogistics.OutwardInsDate,
						oSavedLogistics.sInsDate,
						oIns.InsuranceDate,
						o.InsuranceDate,
						o.GatePassDate,
						o.CreatedOn,
						o.IssueDate
					);
					if (!sFinalOutwardInsDate && bInsured) {
						sFinalOutwardInsDate = fnValidDate(o.GatePassDate, o.CreatedOn, o.IssueDate);
					}

					var sInsLRV = oSavedLogistics.sInsLRVehicleNo || oSavedLogistics.OutwardInsLRV || o.OutwardInsLRV ||
						oIns.LRNumber || oIns.VehicleNo ||
						[o.LRNumber, o.VehicleNo].filter(Boolean).join(" / ") ||
						o.LRNumber || o.VehicleNo || "";

					var sInsDesc = oSavedLogistics.sInsDescription || oSavedLogistics.OutwardInsDesc || o.OutwardInsDesc ||
						oIns.RGPCoomonDesc || oSavedLogistics.CommonDesc || o.CommonDesc || "";

					aFlat.push({
						"GP No":                            o.GatePassNo || "",
						"Vendor Name":                      o.VendorName || "",
						"Issue Date":                       fnValidDate(o.GatePassDate, o.CreatedOn, o.IssueDate),
						"Common Description":               o.CommonDesc || (oSavedLogistics && oSavedLogistics.CommonDesc) || "",
						"Material Description":             it.MaterialDesc || it.Description || "",
						"Qty Send":                         fSent > 0 ? fSent.toFixed(3) : (it.SentQuantity || it.Quantity || ""),
						"Uom":                              it.UOM || "",
						"HSN Code":                         it.HSNCode || "",
						"Qty Received":                     fRecvd.toFixed(3),
						"Balance Qty":                      fBal.toFixed(3),
						"Due Date":                         sDueDate,
						"Extend Due Date":                  sExtendDueDate,
						"Returned Date":                    sReturnedDate,
						"UOP":                              it.ItemNetPrice || "",
						"Amount":                           it.ItemNetPrice || "",
						"Total Value":                      sItmValStr || it.Totalvalue || "",
						"DC No":                            o.ChallanNumber || o.Challanumber || o.ChallanNo || o.DCNumber || (oSavedLogistics && (oSavedLogistics.ChallanNumber || oSavedLogistics.DCNumber)) || "",
						"DC/DF Notes":                      o.DCNotes || (oSavedLogistics && oSavedLogistics.DCNotes) || "",
						"LR Number":                        o.LRNumber || o.LRNnumber || (oSavedLogistics && oSavedLogistics.LRNumber) || "",
						"Vehicle No":                       o.VehicleNo || (oSavedLogistics && oSavedLogistics.VehicleNo) || "",
						"EWB No":                           o.EWBNo || o.EWBno || o.EwbNo || (oSavedLogistics && oSavedLogistics.EWayBillNo) || "",
						"Transport Name":                   o.TransporterName || (oSavedLogistics && oSavedLogistics.TransporterName) || "",
						"Transporter GST":                  o.TransporterGST || (oSavedLogistics && oSavedLogistics.TransporterGST) || "",
						"Insurance Yes/ No":                bInsured ? "YES" : "NO",
						"Insurance Value":                  sFinalInsAmount,
						"Outward Insurance LR/Vehicle No":   sInsLRV,
						"Outward Insurance Description":     sInsDesc,
						"Outward Insurance Date":            sFinalOutwardInsDate,
						"Outward Insurance Value":           sFinalOutwardInsVal,
						"GP Req No":                        o.GatePassReqNo || o.GatePassreqNo || "",
						"Requested User":                   that._resolveUserName(o.ReqEmpName || o.RequestedUser || o.Requestor || o.ReqUser || o.CreatedBy || "", o),
						"Department":                       o.Department || "",
						"User Remarks":                     o.Remarks || "",
						"HOD Remarks":                      (function () {
							if (o.HODRemarks || o.HodRemarks) return o.HODRemarks || o.HodRemarks;
							try {
								var sR = localStorage.getItem("req_remarks_" + sReqKey) || localStorage.getItem("req_remarks_" + sGPKey) ||
								         localStorage.getItem("logistics_" + sGPKey) || localStorage.getItem("gp_logistics_" + sGPKey);
								if (sR) { var oP = JSON.parse(sR); return oP.HODRemarks || oP.HodRemarks || ""; }
							} catch (e) {}
							return "";
						})(),
						"Store Remarks":                    (function () {
							if (o.STORERemarks || o.StoreRemarks) return o.STORERemarks || o.StoreRemarks;
							try {
								var sR = localStorage.getItem("req_remarks_" + sReqKey) || localStorage.getItem("req_remarks_" + sGPKey) ||
								         localStorage.getItem("logistics_" + sGPKey) || localStorage.getItem("gp_logistics_" + sGPKey);
								if (sR) { var oP = JSON.parse(sR); return oP.StoreRemarks || oP.STORERemarks || ""; }
							} catch (e) {}
							return "";
						})(),
						"Status":                           sDisp,
						"Fiscal Year":                      o.FiscalYear || ""
					});
				});
			});
			return aFlat;
		},

		// ── NRGP (28 columns) ──
		_buildNRGPRows: function (aResults) {
			var aFlat = [];
			var that = this;
			aResults.forEach(function (o) {
				var aItems = (o.OutgateNav && o.OutgateNav.results) || [];
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"GP No":              o.GatePassNo || "",
						"Vendor Name":        o.VendorName || "",
						"Issue Date":         fmtD(o.GatePassDate),
						"Common Description":   o.CommonDesc || "",
						"Material Description": it.MaterialDesc || it.Description || "",
						"Qty Send":           it.SentQuantity || it.Quantity || "",
						"Uom":                it.UOM || "",
						"HSN Code":           it.HSNCode || "",
						"UOP":                it.ItemNetPrice || "",
						"Amount":             it.ItemNetPrice || "",
						"Total Value":        it.Totalvalue || "",
						"DC No":              o.ChallanNumber || o.Challanumber || o.ChallanNo || o.DCNumber || "",
						"DC/DF Notes":        o.DCNotes || "",
						"LR Number":          o.LRNumber || o.LRNnumber || "",
						"Vehicle No":         o.VehicleNo || "",
						"EWB No":             o.EWBNo || o.EWBno || o.EwbNo || "",
						"Transport Name":     o.TransporterName || "",
						"Transporter GST":    o.TransporterGST || "",
						"Insurance Yes/ No":  o.InsuranceReq || "NO",
						"Insurance Date":     fmtD(o.InsuranceDate),
						"GP Req No":          o.GatePassReqNo || o.GatePassreqNo || "",
						"Requested User":     that._resolveUserName(o.ReqEmpName || o.RequestedUser || o.Requestor || o.ReqUser || o.CreatedBy || "", o),
						"Department":         o.Department || "",
						"User Remarks":       o.Remarks || "",
						"HOD Remarks":        (function () {
							if (o.HODRemarks || o.HodRemarks) return o.HODRemarks || o.HodRemarks;
							var sK1 = String(o.GatePassReqNo || o.GatePassreqNo || "").trim();
							var sK2 = String(o.GatePassNo || "").trim();
							try {
								var sR = localStorage.getItem("req_remarks_" + sK1) || localStorage.getItem("req_remarks_" + sK2) ||
								         localStorage.getItem("logistics_" + sK2) || localStorage.getItem("gp_logistics_" + sK2);
								if (sR) { var oP = JSON.parse(sR); return oP.HODRemarks || oP.HodRemarks || ""; }
							} catch (e) {}
							return "";
						})(),
						"Store Remarks":      (function () {
							if (o.STORERemarks || o.StoreRemarks) return o.STORERemarks || o.StoreRemarks;
							var sK1 = String(o.GatePassReqNo || o.GatePassreqNo || "").trim();
							var sK2 = String(o.GatePassNo || "").trim();
							try {
								var sR = localStorage.getItem("req_remarks_" + sK1) || localStorage.getItem("req_remarks_" + sK2) ||
								         localStorage.getItem("logistics_" + sK2) || localStorage.getItem("gp_logistics_" + sK2);
								if (sR) { var oP = JSON.parse(sR); return oP.StoreRemarks || oP.STORERemarks || ""; }
							} catch (e) {}
							return "";
						})(),
						"Status":             o.GPStatus || "",
						"Fiscal Year":        o.FiscalYear || ""
					});
				});
			});
			return aFlat;
		},

		// ── PCP (14 columns) ──
		_buildPCPRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.PCPItmNav && o.PCPItmNav.results) || [];
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"PCP No":       o.GatepassNo || "",
						"PCP Date":     fmtD(o.PCPDate),
						"Entry":        o.EntryPoint || "",
						"GE No":        o.GateEntryNo || "",
						"GE Date":      fmtD(o.GEDate),
						"Dept":         o.Department || "",
						"Supplier":     o.VendorDesc || "",
						"Items":        it.ItemDescription || "",
						"Qty":          it.RecievedQuantity || "",
						"UOM":          it.UOM || "",
						"DC/INV No":    o.DCNumber || "",
						"DC/INV Date":  fmtD(o.DCdate),
						"Total cost":   o.TotalCost || "",
						"Budget":       o.BudgetCode || ""
					});
				});
			});
			return aFlat;
		},

		// ── Gate Entry (18 columns) ──
		_buildGateEntryRows: function (aResults, sFilter) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.PCPItmNav && o.PCPItmNav.results) || [];
				var sStatus = o.GatepassNo ? "COMPLETED" : "PENDING";
				if (sFilter === "PENDING_INSP") {
					sStatus = (o.InspectionStatus || "PENDING").toUpperCase();
				}
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"GE Date":            fmtD(o.GEDate),
						"GE No":              o.GateEntryNo || "",
						"Vendor":             o.VendorDesc || "",
						"Source Type":        o.SourceType || "",
						"PO No":              o.PurchaseOrder || "",
						"RGP No":             o.RGPNumber || "",
						"PCP No":             o.GatepassNo || "",
						"Budget Code":        o.BudgetCode || "",
						"Total Cost":         o.TotalCost || "",
						"Dept":               o.Department || "",
						"DC / Invoice No":    o.DCNumber || "",
						"Item Description":   it.ItemDescription || "",
						"Qty":                it.RecievedQuantity || it.OrderQuantity || "",
						"UOM":                it.UOM || "",
						"RR No":              o.RRNo || "",
						"Remarks":            o.Remarks || "",
						"Status":             sStatus,
						"Inspection Date":    fmtD(o.Inspectiondate)
					});
				});
			});
			return aFlat;
		},

		// ── IRGP (22 columns) ──
		_buildIRGPRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.IRGPItmNav && o.IRGPItmNav.results) || [];
				if (aItems.length === 0) { aItems = [{}]; }
				var bIsTool = (o.RequestType === "Tools") || (o.RequestType && o.RequestType.toUpperCase().indexOf("TOOL") !== -1);
				aItems.forEach(function (it) {
					var bItemIsTool = bIsTool || (!it.ItemDescription && it.ItemCode && isNaN(it.ItemCode));
					var sToolDesc = it.ItemDescription || (bItemIsTool ? it.ItemCode : "") || "";
					var sItemCode = bItemIsTool ? "" : (it.ItemCode || "");
					aFlat.push({
						"IRGP No":                     o.GatePassNo || "",
						"Req Date":                    fmtD(o.RequestDate),
						"Req Type":                    o.RequestType || "",
						"Item":                        sItemCode,
						"Location":                    it.Location || "",
						"Hexagon Code":                bItemIsTool ? "" : (it.OldMaterialRef || it.HexagonCode || ""),
						"Mp2ItemCode":                 it.Mp2ItmCode || it.Mp2ItemCode || "",
						"Description":                 bItemIsTool ? sToolDesc : (it.ItemDescription || ""),
						"Long Description":            it.MatLongDes || it.matLongDes || it.Matlongdes || "",
						"DefaultBin":                  it.DefaultBin || "",
						"QTY Issued":                  it.SentQuantity || "",
						"Qty Received":                it.RecievedQuantity || "",
						"Balance Qty":                 it.BalanceQuantity || "",
						"UOM":                         it.UOM || "",
						"MRNumber":                    it.MRNumber || o.MRNumber || "",
						"Due Date":                    fmtD(o.DueDate),
						"Extended Due Date":           fmtD(o.RevisedDueDate),
						"Return Date":                 fmtD(o.ReturnedDate),
						"Req User":                    o.RequestedUser || "",
						"Requester Department":        o.Department || "",
						"ContractName":                o.ContractName || "",
						"Contract/MEIL Employee Name": o.TAQAEmployee || "",
						"Status":                      o.Status || "",
						"Remarks":                     o.Remarks || ""
					});
				});
			});
			return aFlat;
		},

		// ── Scrap GP (10 columns) ──
		_buildScrapRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.ScrapPassItmNav && o.ScrapPassItmNav.results) || [];
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"GP No":        o.GatePassNo || "",
						"GP Date":      fmtD(o.GPDate || o.GatePassDate),
						"Vendor":       o.VendorName || o.CustomerName || "",
						"Item":         it.Type || it.Material || "",
						"Description":  it.Description || "",
						"Qty":          it.Quantity || it.SendoutQty || "",
						"UOM":          it.UOM || "",
						"Status":       o.Status || o.GPStatus || "",
						"Remarks":      o.Remarks || "",
						"Vehicle No":   o.VehicleNo || ""
					});
				});
			});
			return aFlat;
		},

		// ── Ash GP (20 columns) ──
		_buildAshRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var sApproval = o.Approval1 === "A" ? "CLOSED" : (o.Approval1 === "R" ? "REJECTED" : "OPEN");
				aFlat.push({
					"Issue Date":            fmtD(o.GPDate),
					"Ash Gate Pass Number":  o.GatePassNo || "",
					"Vendor Name":           o.CustomerName || "",
					"Item Description":      o.ItemDescription || o.CommonDesc || "",
					"Qty Send":              o.Quantity || "",
					"Uom":                   o.UOM || "",
					"HSN Code":              o.HSNCode || "",
					"UOP":                   o.ItemNetPrice || o.UnitPrice || "",
					"Line Cost Value":       o.LineCost || o.ItemNetPrice || "",
					"Total Value":           o.TotalValue || o.Totalvalue || "",
					"Gate Pass Remarks":     o.Remarks || "",
					"DC No":                 o.DCNumber || "",
					"DC Notes":              o.DCNotes || o.Remarks || "",
					"Vehicle No":            o.VehicleNo || "",
					"Transport Name":        o.TransporterName || "",
					"Transporter GST":       o.TransporterGst || o.TransporterGST || "",
					"Request User Name":     o.RequestedUser || o.ReqEmpName || "",
					"Approver Name":         o.ApproverName || o.HODEmpName || "",
					"Department":            o.Department || "",
					"Status":                sApproval
				});
			});
			return aFlat;
		}

	});
});
