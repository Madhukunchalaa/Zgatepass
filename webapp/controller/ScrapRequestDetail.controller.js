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
					var sDateStr = that._formatDateSlash(oItem.RequestDate || oItem.ReqDate);

					// Map items
					var aItems = [];
					if (oItem.ScrapReqItmNav && oItem.ScrapReqItmNav.results) {
						aItems = oItem.ScrapReqItmNav.results.map(function(oSubItem, index) {
							var sUom = that._normalizeUOM(oSubItem.UOM || oSubItem.Uom || "");
							return {
								sno: String(index + 1),
								type: that._mapMaterialType(oSubItem.Material || oSubItem.MaterialType || oSubItem.Type || "", oSubItem.MaterialDesc || oSubItem.Description || ""),
								description: oSubItem.MaterialDesc || oSubItem.Description || "",
								quantity: String(oSubItem.OrderQuantity || oSubItem.Quantity || oSubItem.Qty || "0"),
								uom: sUom
							};
						});
					}

					var sStatus = that._deriveStatus(oItem);

					var oMappedData = {
						requestId: sRequestId,
						requestDate: oItem.RequestDate || null,
						requestDateStr: sDateStr,
						vehicleDetails: oItem.VehicleNo || oItem.VehicleDetails || "",
						collectArea: oItem.CollectArea || "",
						remarks: oItem.Remarks || "",
						HODRemarks: oItem.HODRemarks || "",
						StoreRemarks: oItem.STORERemarks || oItem.StoreRemarks || "",
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



		onNavBack: function () {
			this.getRouter().navTo("ScrapRequestList");
		},

		onApprove: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsHod = oUserModel && oUserModel.getProperty("/IsHodUser");
			
			var sApprovalCode = bIsHod ? "A1" : "A2";
			var sDisplayStatus = bIsHod ? "Store Approval Pending" : "Approved";
			var sRemarks = this.getView().getModel("scrap").getProperty(bIsHod ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Are you sure you want to Approve this request?", {
				title: "Confirm Approval",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus(sApprovalCode, sDisplayStatus, sRemarks, bIsHod ? "HOD" : "Store");
					}
				}.bind(this)
			});
		},

		onReject: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsHod = oUserModel && oUserModel.getProperty("/IsHodUser");
			var sRemarks = this.getView().getModel("scrap").getProperty(bIsHod ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Are you sure you want to Reject this request?", {
				title: "Confirm Rejection",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("R", "Rejected", sRemarks, bIsHod ? "HOD" : "Store");
					}
				}.bind(this)
			});
		},

		onAmend: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsHod = oUserModel && oUserModel.getProperty("/IsHodUser");
			var sRemarks = this.getView().getModel("scrap").getProperty(bIsHod ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Send back for amendment?", {
				title: "Confirm Amendment",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("AM", "Amendment", sRemarks, bIsHod ? "HOD" : "Store");
					}
				}.bind(this)
			});
		},

		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks, sRole) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oViewModel = this.getView().getModel("scrap");
			var sRequestId = oViewModel.getProperty("/requestId");
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			var oPayload = {
				ApprovalReq: sApprovalCode === "AM" ? "AM" : (sApprovalCode === "R" ? "R" : "A")
			};
			if (sRole === "HOD") {
				oPayload.Approval1 = sApprovalCode;
				oPayload.HODRemarks = sRemarks;
			} else {
				oPayload.Approval2 = sApprovalCode;
				oPayload.STORERemarks = sRemarks;
			}

			// Refresh CSRF token before update, then perform MERGE (not full PUT)
			oODataModel.refreshSecurityToken(function () {
				oODataModel.update("/ScrapReqHdrSet(GatePassReqNo='" + sRequestId + "')", oPayload, {
					merge: true,
					success: function () {
						sap.ui.core.BusyIndicator.hide();
						oViewModel.setProperty("/status", sDisplayStatus);

						// If Store approves (2nd level), add items to Scrap Inventory in localStorage
						if (sRole === "Store" && sApprovalCode === "A2") {
							try {
								var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
								var aItems = oViewModel.getProperty("/items") || [];
								aItems.forEach(function (oItem) {
									var sType = oItem.type;
									var fQty = parseFloat(oItem.quantity) || 0;
									if (sType) {
										if (!oInventory[sType]) {
											oInventory[sType] = { quantity: 0, uom: oItem.uom || "Kilogram" };
										}
										oInventory[sType].quantity = (parseFloat(oInventory[sType].quantity) || 0) + fQty;
									}
								});
								localStorage.setItem("mockScrapInventory", JSON.stringify(oInventory));
							} catch (e) {
								console.error("Failed to update mock scrap inventory:", e);
							}
						}

						MessageToast.show("Status updated to " + sDisplayStatus);
						setTimeout(function() {
							that.onNavBack();
						}, 1500);
					},
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to update status.";
						try {
							// Try JSON error body
							var oBody = JSON.parse(oError.responseText);
							if (oBody.error && oBody.error.message && oBody.error.message.value) {
								sMsg = oBody.error.message.value;
							}
						} catch (e) {
							// Try XML error body
							try {
								var sRaw = oError.responseText || "";
								var oMatch = sRaw.match(/<message[^>]*>([^<]+)<\/message>/i);
								if (oMatch && oMatch[1]) {
									sMsg = oMatch[1];
								}
							} catch (e2) {}
						}
						// Log full details for debugging
						jQuery.sap.log.error("ScrapApproval UPDATE failed", JSON.stringify({
							status: oError.statusCode || oError.status,
							text: oError.statusText,
							responseText: oError.responseText ? oError.responseText.substring(0, 500) : ""
						}));
						MessageBox.error(sMsg + "\n\nRequest: " + sRequestId + "\nRole: " + sRole);
					}
				});
			}, function (oTokenError) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Failed to refresh security token. Please reload the page.");
			});
		}

	});
});
