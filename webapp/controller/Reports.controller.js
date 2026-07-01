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
		{ sno: 1,  tab: "1.All RGP Report",              hdr: 36 },
		{ sno: 2,  tab: "2.Pending RGP Report",          hdr: 36 },
		{ sno: 3,  tab: "3.Closed RGP Report",           hdr: 36 },
		{ sno: 4,  tab: "4.All NRGP Report",             hdr: 27 },
		{ sno: 5,  tab: "5.All PCP Report",              hdr: 14 },
		{ sno: 6,  tab: "6.All Gate Entry Report",       hdr: 18 },
		{ sno: 7,  tab: "7.Pending Gate Entry Rpt",      hdr: 18 },
		{ sno: 8,  tab: "8.Pending Inspection Rpt",      hdr: 18 },
		{ sno: 9,  tab: "9.Scrap Stock Inward Rpt",      pending: true },
		{ sno: 10, tab: "10.Scrap Stock Outward Rpt",    pending: true },
		{ sno: 11, tab: "11.Current Scrap Stock Rpt",    pending: true },
		{ sno: 12, tab: "12.Pending IRGP Report",        hdr: 22 },
		{ sno: 13, tab: "13.Complete IRGP Report",       hdr: 22 },
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

		// ═══════════════════════════════════════════════════════════════
		//  Generate All Reports — single multi-sheet Excel workbook
		// ═══════════════════════════════════════════════════════════════
		onGenerateAllReportsButtonPress: function () {
			var dFrom = this.byId("idReportFromDatePicker").getDateValue();
			var dTo   = this.byId("idReportToDatePicker").getDateValue();
			var that  = this;
			var oModel = this._odata();

			var oData = {};
			var iTotal = 6;
			var iDone  = 0;

			sap.ui.core.BusyIndicator.show(0);

			function done() {
				iDone++;
				if (iDone < iTotal) { return; }
				sap.ui.core.BusyIndicator.hide();
				that._assembleWorkbook(oData, dFrom, dTo);
			}

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

		// ── RGP (36 columns) ──
		_buildRGPRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.OutgateNav && o.OutgateNav.results) || [];
				var sStatus = (o.GPStatus || "").toUpperCase();
				var sDisp = sStatus;
				if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") { sDisp = "AWAIT RETN"; }
				else if (sStatus === "OPEN") { sDisp = "AWAIT ACKN"; }

				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"GP No":                            o.GatePassNo || "",
						"Vendor Name":                      o.VendorName || "",
						"Issue Date":                       fmtD(o.GatePassDate),
						"Material Description":             o.CommonDesc || "",
						"Item Name":                        it.MaterialDesc || it.Description || "",
						"Qty Send":                         it.SentQuantity || it.Quantity || "",
						"Uom":                              it.UOM || "",
						"HSN Code":                         it.HSNCode || "",
						"Qty Received":                     it.RecievedQuantity || "",
						"Balance Qty":                      it.BalanceQuantity || "",
						"Due Date":                         fmtD(o.ReturnableDate || o.DueDate),
						"Extend Due Date":                  fmtD(o.ExtReturnDate || o.Extreturndate || o.ExtendedReturnableDate),
						"Returned Date":                    fmtD(o.ReturnedDate),
						"UOP":                              it.ItemNetPrice || "",
						"Amount":                           it.ItemNetPrice || "",
						"Total Value":                      it.Totalvalue || "",
						"DC No":                            o.ChallanNumber || "",
						"DC/DF Notes":                      o.CommonDesc || "",
						"LR/Vehicle No":                    o.VehicleNo || "",
						"EWB No":                           o.EWBNo || o.EWBno || o.EwbNo || "",
						"Transport Name":                   o.TransporterName || "",
						"Transporter GST":                  o.TransporterGST || "",
						"Insurance Yes/ No":                o.InsuranceReq || "NO",
						"Insurance Value":                  o.InsuranceAmount || "",
						"Inward Insurance LR/Vehicle No":   o.InwardInsLRV || "",
						"Inward Insurance Description":     o.InwardInsDesc || "",
						"Inward Insurance Date":            fmtD(o.InwardInsDate),
						"Inward Insurance Value":           o.InwardInsValue || "",
						"GP Req No":                        o.GatePassReqNo || o.GatePassreqNo || "",
						"User":                             o.ReqEmpName || o.RequestedUser || "",
						"Department":                       o.Department || "",
						"User Remarks":                     o.Remarks || "",
						"Dept Remarks":                     o.HODRemarks || "",
						"Store Remarks":                    o.STORERemarks || o.StoreRemarks || "",
						"Status":                           sDisp,
						"Fiscal Year":                      o.FiscalYear || ""
					});
				});
			});
			return aFlat;
		},

		// ── NRGP (27 columns) ──
		_buildNRGPRows: function (aResults) {
			var aFlat = [];
			aResults.forEach(function (o) {
				var aItems = (o.OutgateNav && o.OutgateNav.results) || [];
				if (aItems.length === 0) { aItems = [{}]; }
				aItems.forEach(function (it) {
					aFlat.push({
						"GP No":              o.GatePassNo || "",
						"Vendor Name":        o.VendorName || "",
						"Issue Date":         fmtD(o.GatePassDate),
						"Material Description": o.CommonDesc || "",
						"Item Name":          it.MaterialDesc || it.Description || "",
						"Qty Send":           it.SentQuantity || it.Quantity || "",
						"Uom":                it.UOM || "",
						"HSN Code":           it.HSNCode || "",
						"UOP":                it.ItemNetPrice || "",
						"Amount":             it.ItemNetPrice || "",
						"Total Value":        it.Totalvalue || "",
						"DC No":              o.ChallanNumber || "",
						"DC/DF Notes":        o.CommonDesc || "",
						"LR/Vehicle No":      o.VehicleNo || "",
						"EWB No":             o.EWBNo || o.EWBno || o.EwbNo || "",
						"Transport Name":     o.TransporterName || "",
						"Transporter GST":    o.TransporterGST || "",
						"Insurance Yes/ No":  o.InsuranceReq || "NO",
						"Insurance Date":     fmtD(o.InsuranceDate),
						"GP Req No":          o.GatePassReqNo || o.GatePassreqNo || "",
						"User":               o.ReqEmpName || o.RequestedUser || "",
						"Department":         o.Department || "",
						"User Remarks":       o.Remarks || "",
						"Dept Remarks":       o.HODRemarks || "",
						"Store Remarks":      o.STORERemarks || o.StoreRemarks || "",
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
				aItems.forEach(function (it) {
					aFlat.push({
						"IRGP No":                     o.GatePassNo || "",
						"Req Date":                    fmtD(o.RequestDate),
						"Req Type":                    o.RequestType || "",
						"Item":                        it.ItemCode || "",
						"Location":                    it.Location || "",
						"Mp2ItemCode":                 it.Mp2ItmCode || "",
						"Description":                 it.ItemDescription || "",
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
