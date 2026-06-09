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

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				that.onNavBack();
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
						MessageBox.error("Request not found.");
						that.onNavBack();
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
						requestDate: oItem.RequestDate || null,
						requestDateStr: sDateStr,
						vehicleDetails: oItem.VehicleNo || oItem.VehicleDetails || "",
						collectArea: oItem.CollectArea || "",
						remarks: oItem.Remarks || "",
						status: sStatus,
						weighmentSlipNo: oItem.WeighmentSlipNo || "",
						challanDateTime: oItem.ChallanDateTime || "",
						items: aItems
					};

					var oModel = new JSONModel(oMappedData);
					that.getView().setModel(oModel, "scrap");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load request details. Please try again.");
					that.onNavBack();
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
						this._updateStatus("A", "Approved");
					}
				}.bind(this)
			});
		},

		onReject: function () {
			MessageBox.confirm("Are you sure you want to Reject this request?", {
				title: "Confirm Rejection",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("R", "Rejected");
					}
				}.bind(this)
			});
		},

		onAmend: function () {
			MessageBox.confirm("Send back for amendment?", {
				title: "Confirm Amendment",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("P", "Pending Amendment");
					}
				}.bind(this)
			});
		},

		_updateStatus: function (sApprovalCode, sDisplayStatus) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oViewModel = this.getView().getModel("scrap");
			var sRequestId = oViewModel.getProperty("/requestId");
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.update("/ScrapReqHdrSet(GatePassReqNo='" + sRequestId + "')", {
				ApprovalReq: sApprovalCode
			}, {
				success: function () {
					sap.ui.core.BusyIndicator.hide();
					oViewModel.setProperty("/status", sDisplayStatus);
					MessageToast.show("Status updated to " + sDisplayStatus);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to update status. Please try again.");
				}
			});
		}

	});
});
