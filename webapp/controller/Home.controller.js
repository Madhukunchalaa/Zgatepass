sap.ui.define([
	"./BaseController"
], function (BaseController) {
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

		onPressGatePassList: function () {
    this.getRouter().navTo("GatePassList");
},

		onPressInward: function () {
			this.getRouter().navTo("InwardGatePass");
		},

		onPressOutGatePass: function () {
			this.getRouter().navTo("OutGatePass");
		},

		onGenericTileAnalyticsPress: function () {
			this.getRouter().navTo("analytics");
		}

	});
});
