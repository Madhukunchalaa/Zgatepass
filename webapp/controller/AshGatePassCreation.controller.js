sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
		},

		_initModel: function () {
			var oDate = new Date();
			
			// Hardcoded initial data for Ash Gate Pass
			var oData = {
				gpDate: oDate,
				vendor: "",
				vendorAddress: "",
				vendorGST: "",
				VehicleNo: "",
				TransportMode: "Road",
				TransporterName: "",
				TransporterGST: "",
				Remarks: "For Ash disposal to cement plant",
				DCNotes: "For Ash disposal to cement plant",
				finalTotal: "0.00",
				items: [
					{
						sno: "1",
						materialName: "Fly Ash",
						hsnCode: "62100000",
						quantity: "",
						uom: "METRIC TONS",
						rate: "",
						amount: "0.00"
					}
				]
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "ash");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onVendorSelect: function (oEvent) {
			var oModel = this.getView().getModel("ash");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			
			// Mocking vendor data retrieval
			if (sKey === "V1") {
				oModel.setProperty("/vendorAddress", "Ramco Cement Ltd, Alathiyur Works, P.A.C. Ramaswamy Raja Nagar, Alathiyur, Ariyalur District, India");
				oModel.setProperty("/vendorGST", "33AABCM8375L2Z2");
			} else if (sKey === "V2") {
				oModel.setProperty("/vendorAddress", "123 Domestic Road, Chennai");
				oModel.setProperty("/vendorGST", "33XXXXXXXXXXXXX");
			}
		},

		onTransporterSelect: function (oEvent) {
			var oModel = this.getView().getModel("ash");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			
			// Mocking transporter data
			if (sKey === "T1") {
				oModel.setProperty("/TransporterGST", "33AEPP2875A2ZV");
			} else if (sKey === "T2") {
				oModel.setProperty("/TransporterGST", "33BBBBBBBBBBBB");
			}
		},

		calculateTotal: function () {
			var oModel = this.getView().getModel("ash");
			var aItems = oModel.getProperty("/items");
			
			var nTotal = 0;
			aItems.forEach(function(oItem, index) {
				var qty = parseFloat(oItem.quantity) || 0;
				var rate = parseFloat(oItem.rate) || 0;
				var amount = qty * rate;
				oModel.setProperty("/items/" + index + "/amount", amount.toFixed(2));
				nTotal += amount;
			});
			
			oModel.setProperty("/finalTotal", nTotal.toFixed(2));
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("ash");
			var oData = oModel.getData();
			
			// Validation
			if (!oData.vendor) { MessageBox.error("Please select a Vendor."); return; }
			if (!oData.VehicleNo) { MessageBox.error("Please enter Vehicle No."); return; }
			if (!oData.TransporterName) { MessageBox.error("Please select a Transporter."); return; }
			if (!oData.items[0].quantity || parseFloat(oData.items[0].quantity) <= 0) {
				MessageBox.error("Please enter a valid Quantity."); return;
			}
			if (!oData.items[0].rate || parseFloat(oData.items[0].rate) <= 0) {
				MessageBox.error("Please enter a valid Rate."); return;
			}

			// Mock saving logic
			sap.ui.core.BusyIndicator.show(0);
			setTimeout(function() {
				sap.ui.core.BusyIndicator.hide();
				
				// Generate mock Request ID
				var sRequestId = "AGP2024-25/00" + Math.floor(Math.random() * 90 + 10);
				
				// Here we would normally save to OData. For now we just show success and go back.
				MessageToast.show(sRequestId + " - Added Successfully");
				
				// Optional: Save to local storage to mock list screen
				var aMockList = JSON.parse(localStorage.getItem("mockAshList") || "[]");
				oData.requestId = sRequestId;
				oData.status = "OPEN"; // Initial status
				aMockList.push(oData);
				localStorage.setItem("mockAshList", JSON.stringify(aMockList));
				
				this.onNavBack();
			}.bind(this), 1000);
		}

	});
});
