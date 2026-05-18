sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapRequestCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapRequestCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
		},

		_initModel: function () {
			var oDate = new Date();
			
			var oData = {
				requestDate: oDate,
				weighmentSlipNo: "",
				challanDateTime: "",
				vehicleDetails: "",
				collectArea: "",
				remarks: "",
				items: [
					{
						sno: "1",
						type: "",
						description: "",
						quantity: "",
						uom: "KILOGRAM"
					}
				]
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "scrap");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("scrap");
			var aItems = oModel.getProperty("/items");
			aItems.push({
				sno: String(aItems.length + 1),
				type: "",
				description: "",
				quantity: "",
				uom: "KILOGRAM"
			});
			oModel.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oModel = this.getView().getModel("scrap");
			var aItems = oModel.getProperty("/items");
			if (aItems.length <= 1) {
				return;
			}
			
			var oContext = oEvent.getSource().getBindingContext("scrap");
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			aItems.splice(iIndex, 1);
			
			// Re-index
			aItems.forEach(function(oItem, idx) {
				oItem.sno = String(idx + 1);
			});
			
			oModel.setProperty("/items", aItems);
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("scrap");
			var oData = oModel.getData();
			
			// Simple Validation
			if (!oData.items[0].type) {
				MessageBox.error("Please select a Material Type for item 1.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			setTimeout(function() {
				sap.ui.core.BusyIndicator.hide();
				
				// Generate mock Request ID
				var sRequestId = "REQ-" + Math.floor(Math.random() * 9000 + 1000);
				
				MessageToast.show("Added Successfully");
				
				// Save to local storage mock
				var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
				oData.requestId = sRequestId;
				oData.status = "Pending HOD";
				oData.requestDateStr = oData.requestDate.toLocaleDateString("en-GB");
				aMockList.push(oData);
				localStorage.setItem("mockScrapRequests", JSON.stringify(aMockList));
				
				this.onNavBack();
			}.bind(this), 1000);
		}

	});
});
