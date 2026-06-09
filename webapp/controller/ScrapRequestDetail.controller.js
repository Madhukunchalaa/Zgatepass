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

		_deriveStatus: function (oItem) {
			var s1 = oItem.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = oItem.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = oItem.Status || oItem.ReqStatus;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			if (s1 === "R"  || s2 === "R")  return "Rejected";
			if (s1 === "AM" || s2 === "AM") return "Amendment";
			if (s2) return "Approved";
			
			var sStoreRemarks = oItem.STORERemarks;
			if (sStoreRemarks && String(sStoreRemarks).trim() !== "" && String(sStoreRemarks) !== "null") {
				return "Approved";
			}

			if (s1 && !s2) return "Store Approval Pending";
			
			if (oItem.ApprovalReq === "A") return "Approved";
			if (oItem.ApprovalReq === "R") return "Rejected";
			if (oItem.ApprovalReq === "P") return "Pending";
			
			if (sStatus === "STORE APPROVAL PENDING") return "Store Approval Pending";
			if (sStatus === "APPROVED") return "Approved";
			if (sStatus === "REJECTED") return "Rejected";
			if (sStatus === "AMENDMENT") return "Amendment";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";
			
			return "Pending";
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
