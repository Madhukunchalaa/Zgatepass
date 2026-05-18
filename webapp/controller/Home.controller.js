sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.Home", {

		onInit: function () {
		},

		onPressNRGP: function () {
			this.getRouter().navTo("GatePassCreation", {
				type: "NRGP"
			});
		},

		onPressRGP: function () {
			this.getRouter().navTo("GatePassCreation", {
				type: "RGP"
			});
		},

		onPressInward: function () {
			this.getRouter().navTo("InwardGatePass");
		},

		onPressOutGatePass: function () {
			this.getRouter().navTo("OutGatePass");
		},

		onGenericTileAnalyticsPress: function () {
			this.getRouter().navTo("analytics");
		},

		onPressNRGPList: function () {
			this.getRouter().navTo("NRGPList");
		},

		onGenericTileGatePassListPress: function () {
			this.getRouter().navTo("GatePassList");
		},

		onGenericTileGatePassWithPOPress: function () {
			this.getRouter().navTo("GatePassWithPO");
		},

		onPressIRGP: function () {
			this.getRouter().navTo("IRGP", {
				step: "LIST",
				gpNo: "ALL"
			});
		},

		// ==========================================================
		// ADD PCP FEATURE
		// ==========================================================

		onPressAddPCP: function () {
			this.getRouter().navTo("PCPList");
		},

		// ==========================================================
		// ASH GATE PASS
		// ==========================================================

		onPressAshGatePassCreation: function () {
			this.getRouter().navTo("AshGatePassCreation");
		},

		onPressAshGatePassList: function () {
			this.getRouter().navTo("AshGatePassList");
		},

		// ==========================================================
		// SCRAP MODULE
		// ==========================================================

		onPressScrapRequestCreation: function () {
			this.getRouter().navTo("ScrapRequestCreation");
		},

		onPressScrapRequestList: function () {
			this.getRouter().navTo("ScrapRequestList");
		},

		onPressScrapGatepassCreation: function () {
			this.getRouter().navTo("ScrapGatepassCreation");
		}

	});
});
