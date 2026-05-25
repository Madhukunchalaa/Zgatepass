sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
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
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			
			// Load local overrides
			var aLocalRequests = JSON.parse(localStorage.getItem("mockScrapRequests") || "[]");
			var oLocalData = aLocalRequests.find(function (item) {
				return item.requestId === sRequestId;
			});

			var fnFallback = function () {
				if (!oLocalData) {
					MessageBox.error("Request not found!");
					that.onNavBack();
					return;
				}
				var oModel = new JSONModel(oLocalData);
				that.getView().setModel(oModel, "scrap");
			};

			if (!oODataModel) {
				fnFallback();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sRequestId)],
				urlParameters: { "$expand": "ScrapReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = oData.results && oData.results[0];
					if (!oItem) {
						fnFallback();
						return;
					}

					// Format date
					var sDateStr = that._formatRequestDate(oItem.RequestDate || oItem.ReqDate);

					// Map items
					var aItems = [];
					if (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results) {
						aItems = oItem.ScrapReqItmNav.results.map(function(oSubItem, index) {
							var sRawUom = (oSubItem.UOM || oSubItem.Uom || "").toUpperCase();
							var sUom = "KG";
							if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
								sUom = "KG";
							} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
								sUom = "L";
							} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("TO") !== -1 || sRawUom.indexOf("MT") !== -1) {
								sUom = "MT";
							}
							return {
								sno: String(index + 1),
								type: that._mapMaterialType(oSubItem.Material || oSubItem.MaterialType || oSubItem.Type || "", oSubItem.MaterialDesc || oSubItem.Description || ""),
								description: oSubItem.MaterialDesc || oSubItem.Description || "",
								quantity: String(oSubItem.OrderQuantity || oSubItem.Quantity || oSubItem.Qty || "0"),
								uom: sUom
							};
						});
					} else if (oLocalData && oLocalData.items) {
						aItems = oLocalData.items;
					}

					var sStatus = "Pending";
					if (oItem.ApprovalReq === "A") {
						sStatus = "Approved";
					} else if (oItem.ApprovalReq === "P") {
						sStatus = "Pending";
					} else if (oItem.ApprovalReq === "R") {
						sStatus = "Rejected";
					} else if (oItem.Status || oItem.ReqStatus) {
						sStatus = oItem.Status || oItem.ReqStatus;
					}

					var oMappedData = {
						requestId: sRequestId,
						requestDate: oItem.RequestDate || (oLocalData ? oLocalData.requestDate : null),
						requestDateStr: sDateStr || (oLocalData ? oLocalData.requestDateStr : ""),
						vehicleDetails: (oLocalData && oLocalData.vehicleDetails) ? oLocalData.vehicleDetails : (oItem.VehicleNo || oItem.VehicleDetails || ""),
						collectArea: (oLocalData && oLocalData.collectArea) ? oLocalData.collectArea : (oItem.CollectArea || ""),
						remarks: (oLocalData && oLocalData.remarks) ? oLocalData.remarks : (oItem.Remarks || ""),
						status: (oLocalData && oLocalData.status) ? oLocalData.status : sStatus,
						weighmentSlipNo: (oLocalData && oLocalData.weighmentSlipNo) ? oLocalData.weighmentSlipNo : (oItem.WeighmentSlipNo || ""),
						challanDateTime: (oLocalData && oLocalData.challanDateTime) ? oLocalData.challanDateTime : (oItem.ChallanDateTime || ""),
						items: aItems
					};

					var oModel = new JSONModel(oMappedData);
					that.getView().setModel(oModel, "scrap");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},

		_formatRequestDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				var dd = String(vDate.getDate()).padStart(2, '0');
				var mm = String(vDate.getMonth() + 1).padStart(2, '0');
				var yyyy = vDate.getFullYear();
				return dd + "/" + mm + "/" + yyyy;
			}
			if (typeof vDate === "string") {
				if (vDate.indexOf("Date") !== -1) {
					var timestamp = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
					if (!isNaN(timestamp)) {
						return this._formatRequestDate(new Date(timestamp));
					}
				}
				if (/^\d{8}$/.test(vDate)) {
					return vDate.substring(6, 8) + "/" + vDate.substring(4, 6) + "/" + vDate.substring(0, 4);
				}
				var aParts = vDate.split("T")[0].split("-");
				if (aParts.length === 3) {
					return aParts[2] + "/" + aParts[1] + "/" + aParts[0];
				}
			}
			return String(vDate);
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
			if (!oItem) {
				oItem = {
					requestId: sRequestId,
					requestDate: oModel.getProperty("/requestDate"),
					requestDateStr: oModel.getProperty("/requestDateStr"),
					vehicleDetails: oModel.getProperty("/vehicleDetails"),
					collectArea: oModel.getProperty("/collectArea"),
					remarks: oModel.getProperty("/remarks"),
					weighmentSlipNo: oModel.getProperty("/weighmentSlipNo"),
					challanDateTime: oModel.getProperty("/challanDateTime"),
					items: oModel.getProperty("/items"),
					status: sNewStatus
				};
				aMockList.push(oItem);
			} else {
				oItem.status = sNewStatus;
			}
			localStorage.setItem("mockScrapRequests", JSON.stringify(aMockList));
			
			oModel.setProperty("/status", sNewStatus);
			MessageToast.show("Status updated to " + sNewStatus);
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
