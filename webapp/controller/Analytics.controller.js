sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, JSONModel) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.Analytics", {

		onInit: function () {
			this.getView().setModel(new JSONModel(this._emptyModel()), "analytics");
			this._getData();
		},

		_emptyModel: function () {
			return {
				tiles: {
					total: 0, pending: 0, approved: 0, rejected: 0
				},
				barData: [],
				pieData: [],
				typeSummaries: []
			};
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			var aResults = {
				nrgp: [], rgp: [], outward: [], inpo: [], irgp: [], scrap: [], ash: []
			};
			var iDone = 0;
			var iExpected = 7;

			function onDone() {
				iDone++;
				if (iDone === iExpected) {
					sap.ui.core.BusyIndicator.hide();
					that._processData(aResults);
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			// 1. NRGP
			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { aResults.nrgp = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 2. RGP
			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) { aResults.rgp = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 3. Outward Gate Pass
			oODataModel.read("/OutGatePassSet", {
				success: function (oData) { aResults.outward = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 4. Inward PO Gate Pass
			oODataModel.read("/GateInPoHdrSet", {
				success: function (oData) { aResults.inpo = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 5. Inward RGP
			oODataModel.read("/IRGPHdrSet", {
				success: function (oData) { aResults.irgp = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 6. Scrap Request
			oODataModel.read("/ScrapReqHdrSet", {
				success: function (oData) { aResults.scrap = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});

			// 7. Ash Gatepass
			oODataModel.read("/AshHdrSet", {
				success: function (oData) { aResults.ash = oData.results || []; onDone(); },
				error: function () { onDone(); }
			});
		},

		_normalizeStatus: function(sStatus, sApprovalReq) {
			if (!sStatus && !sApprovalReq) return "Approved"; // Assume finalized items with no status are approved
			var s = String(sStatus || sApprovalReq || "").toLowerCase();
			if (s.includes("pen") || s.includes("init") || s === "x") return "Pending";
			if (s.includes("app") || s.includes("rel")) return "Approved";
			if (s.includes("rej") || s.includes("can")) return "Rejected";
			return "Approved";
		},

		_processData: function (aResults) {
			var that = this;
			var oStats = {
				nrgp:    { name: "NRGP", total: 0, pending: 0, approved: 0, rejected: 0 },
				rgp:     { name: "RGP", total: 0, pending: 0, approved: 0, rejected: 0 },
				outward: { name: "Outward", total: 0, pending: 0, approved: 0, rejected: 0 },
				inpo:    { name: "Inward PO", total: 0, pending: 0, approved: 0, rejected: 0 },
				irgp:    { name: "Inward RGP", total: 0, pending: 0, approved: 0, rejected: 0 },
				scrap:   { name: "Scrap Request", total: 0, pending: 0, approved: 0, rejected: 0 },
				ash:     { name: "Ash Gatepass", total: 0, pending: 0, approved: 0, rejected: 0 }
			};

			var aGlobal = { total: 0, pending: 0, approved: 0, rejected: 0 };

			function processList(aItems, sKey, sStatusField, sApprovalField) {
				aItems.forEach(function(item) {
					var sNorm = that._normalizeStatus(item[sStatusField], item[sApprovalField]);
					oStats[sKey].total++;
					aGlobal.total++;
					if (sNorm === "Pending") { oStats[sKey].pending++; aGlobal.pending++; }
					else if (sNorm === "Approved") { oStats[sKey].approved++; aGlobal.approved++; }
					else { oStats[sKey].rejected++; aGlobal.rejected++; }
				});
			}

			processList(aResults.nrgp, "nrgp", "Status");
			processList(aResults.rgp, "rgp", "Status");
			processList(aResults.outward, "outward", "GPStatus");
			processList(aResults.inpo, "inpo", "InspectionStatus");
			processList(aResults.irgp, "irgp", "Status");
			processList(aResults.scrap, "scrap", "ApprovalReq"); // Just checking ApprovalReq
			processList(aResults.ash, "ash", "Status"); // Ash doesn't have status, defaults to approved

			var oModel = this.getView().getModel("analytics");
			oModel.setData({
				tiles: aGlobal,
				barData: [
					{ status: "Pending",  nrgp: oStats.nrgp.pending, rgp: oStats.rgp.pending, outward: oStats.outward.pending, inpo: oStats.inpo.pending, irgp: oStats.irgp.pending, scrap: oStats.scrap.pending, ash: oStats.ash.pending },
					{ status: "Approved", nrgp: oStats.nrgp.approved, rgp: oStats.rgp.approved, outward: oStats.outward.approved, inpo: oStats.inpo.approved, irgp: oStats.irgp.approved, scrap: oStats.scrap.approved, ash: oStats.ash.approved },
					{ status: "Rejected", nrgp: oStats.nrgp.rejected, rgp: oStats.rgp.rejected, outward: oStats.outward.rejected, inpo: oStats.inpo.rejected, irgp: oStats.irgp.rejected, scrap: oStats.scrap.rejected, ash: oStats.ash.rejected }
				],
				pieData: [
					{ status: "Pending",  count: aGlobal.pending },
					{ status: "Approved", count: aGlobal.approved },
					{ status: "Rejected", count: aGlobal.rejected }
				],
				typeSummaries: [
					oStats.nrgp, oStats.rgp, oStats.outward, oStats.inpo, oStats.irgp, oStats.scrap, oStats.ash
				]
			});

			this._applyChartProperties();
		},

		_applyChartProperties: function () {
			var oBar = this.byId("idBarChart");
			if (oBar) {
				oBar.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#3498db", "#9b59b6", "#e67e22", "#16a085", "#f1c40f", "#e74c3c", "#34495e"],
						dataLabel: { visible: true, formatString: "0" }
					},
					categoryAxis: { title: { visible: false } },
					valueAxis:    { title: { visible: false } }
				});
			}

			var oDonut = this.byId("idDonutChart");
			if (oDonut) {
				oDonut.setVizProperties({
					title: { visible: false },
					legend: { visible: true },
					plotArea: {
						colorPalette: ["#E67E22", "#1B6B3A", "#CC2020"],
						dataLabel: { visible: true, type: "percentage", formatString: "0%" }
					}
				});
			}
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		}

	});
});
