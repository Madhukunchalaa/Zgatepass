sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapRequestDetail", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapRequestDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var sRequestId = decodeURIComponent(oEvent.getParameter("arguments").gpNo);
			this._loadDetail(sRequestId);
		},

		_loadDetail: function (sRequestId) {
			var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
			var oData = aMockList.find(function(item) {
				return item.requestId === sRequestId;
			});

			if (!oData) {
				MessageBox.error("Request not found!");
				this.onNavBack();
				return;
			}

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "scrap");
		},

		onNavBack: function () {
			this.getRouter().navTo("ScrapRequestList");
		},

		onApprove: function () {
			MessageBox.confirm("Are you sure you want to Approve this request?", {
				title: "Confirm Approval",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("Approved");
						this._addToInventory();
					}
				}.bind(this)
			});
		},

		onReject: function () {
			MessageBox.confirm("Are you sure you want to Reject this request?", {
				title: "Confirm Rejection",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("Rejected");
					}
				}.bind(this)
			});
		},

		onAmend: function () {
			MessageBox.confirm("Send back for amendment?", {
				title: "Confirm Amendment",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("Pending Amendment");
					}
				}.bind(this)
			});
		},

		_updateStatus: function (sNewStatus) {
			var oModel = this.getView().getModel("scrap");
			var sRequestId = oModel.getProperty("/requestId");
			
			var aMockList = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
			var oItem = aMockList.find(function(item) { return item.requestId === sRequestId; });
			if (oItem) {
				oItem.status = sNewStatus;
				localStorage.setItem("mockScrapRequests", JSON.stringify(aMockList));
				
				oModel.setProperty("/status", sNewStatus);
				MessageToast.show("Status updated to " + sNewStatus);
			}
		},

		_addToInventory: function () {
			var oModel = this.getView().getModel("scrap");
			var aItems = oModel.getProperty("/items");
			
			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			
			aItems.forEach(function(item) {
				var qty = parseFloat(item.quantity) || 0;
				if (qty > 0 && item.type) {
					if (!oInventory[item.type]) {
						oInventory[item.type] = {
							quantity: 0,
							uom: item.uom
						};
					}
					oInventory[item.type].quantity += qty;
				}
			});
			
			localStorage.setItem("mockScrapInventory", JSON.stringify(oInventory));
			MessageToast.show("Inventory Updated with new Scrap material");
		}

	});
});
