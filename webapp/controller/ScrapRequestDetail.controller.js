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

			var fnProcessItem = function (oItem) {
				that._oRawData = oItem;
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
					salesDocument: oItem.SalesDocument || "",
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
			};

			var fnLoadFromList = function () {
				oODataModel.read("/ScrapReqHdrSet", {
					filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
					urlParameters: { "$expand": "ScrapReqItmNav" },
					success: function (oDataAll) {
						sap.ui.core.BusyIndicator.hide();
						var aResults = oDataAll.results || [];
						var oItem = aResults.find(function (r) {
							return (r.GatePassReqNo === sRequestId) || (r.RequestId === sRequestId);
						});
						if (oItem) {
							fnProcessItem(oItem);
						} else {
							MessageBox.error("Request not found.");
							that.onNavBack();
						}
					},
					error: function () {
						sap.ui.core.BusyIndicator.hide();
						MessageBox.error("Failed to load request details.");
						that.onNavBack();
					}
				});
			};

			// Try 1: Read directly by GatePassReqNo
			oODataModel.read("/ScrapReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sRequestId)],
				urlParameters: { "$expand": "ScrapReqItmNav" },
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					if (oItem) {
						sap.ui.core.BusyIndicator.hide();
						fnProcessItem(oItem);
					} else {
						// Try 2: Query with both GatePassReqNo and GatePassType="NRGP"
						oODataModel.read("/ScrapReqHdrSet", {
							filters: [
								new Filter("GatePassReqNo", FilterOperator.EQ, sRequestId),
								new Filter("GatePassType", FilterOperator.EQ, "NRGP")
							],
							urlParameters: { "$expand": "ScrapReqItmNav" },
							success: function (oData2) {
								var oItem2 = oData2.results && oData2.results[0];
								if (oItem2) {
									sap.ui.core.BusyIndicator.hide();
									fnProcessItem(oItem2);
								} else {
									fnLoadFromList();
								}
							},
							error: function () {
								fnLoadFromList();
							}
						});
					}
				},
				error: function () {
					fnLoadFromList();
				}
			});
		},



		onNavBack: function () {
			this.getRouter().navTo("ScrapRequestList");
		},

		onApprove: function () {
			var sCurrentStatus = (this.getView().getModel("scrap").getProperty("/status") || "").trim();
			var bLevel1 = sCurrentStatus !== "Store Approval Pending";
			var sRole = bLevel1 ? "HOD" : "Store";
			var sApprovalCode = bLevel1 ? "A1" : "A2";
			var sDisplayStatus = bLevel1 ? "Store Approval Pending" : "Approved";
			var sRemarks = this.getView().getModel("scrap").getProperty(bLevel1 ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Are you sure you want to Approve this request?", {
				title: "Confirm Approval",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus(sApprovalCode, sDisplayStatus, sRemarks, sRole);
					}
				}.bind(this)
			});
		},

		onReject: function () {
			var sCurrentStatus = (this.getView().getModel("scrap").getProperty("/status") || "").trim();
			var bLevel1 = sCurrentStatus !== "Store Approval Pending";
			var sRole = bLevel1 ? "HOD" : "Store";
			var sRemarks = this.getView().getModel("scrap").getProperty(bLevel1 ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Are you sure you want to Reject this request?", {
				title: "Confirm Rejection",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("R", "Rejected", sRemarks, sRole);
					}
				}.bind(this)
			});
		},

		onAmend: function () {
			var sCurrentStatus = (this.getView().getModel("scrap").getProperty("/status") || "").trim();
			var bLevel1 = sCurrentStatus !== "Store Approval Pending";
			var sRole = bLevel1 ? "HOD" : "Store";
			var sRemarks = this.getView().getModel("scrap").getProperty(bLevel1 ? "/HODRemarks" : "/StoreRemarks") || "";

			MessageBox.confirm("Send back for amendment?", {
				title: "Confirm Amendment",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._updateStatus("AM", "Amendment", sRemarks, sRole);
					}
				}.bind(this)
			});
		},

		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks, sRole) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oViewModel = this.getView().getModel("scrap");
			var sRequestId = oViewModel.getProperty("/requestId");
			var sSalesDoc = oViewModel.getProperty("/salesDocument") || "";
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			var oRaw = this._oRawData || {};
			var aRawItems = (oRaw.ScrapReqItmNav && oRaw.ScrapReqItmNav.results) || (Array.isArray(oRaw.ScrapReqItmNav) ? oRaw.ScrapReqItmNav : []);
			var aNavItems = aRawItems.map(function (item, index) {
				var fQty = parseFloat(String(item.OrderQuantity || item.Quantity || item.Qty || 0).replace(/,/g, '')) || 0;
				return {
					GatePassReqNo: sRequestId,
					SalesDocument: item.SalesDocument || sSalesDoc,
					GatePassType: item.GatePassType || "NRGP",
					ItemNo: item.ItemNo || String((index + 1) * 10).padStart(6, '0'),
					Material: item.Material || "",
					MaterialDesc: item.MaterialDesc || item.Description || "",
					OrderQuantity: fQty.toFixed(3),
					UOM: item.UOM || item.Uom || "KG"
				};
			});

			if (aNavItems.length === 0) {
				var aViewItems = oViewModel.getProperty("/items") || [];
				aNavItems = aViewItems.map(function (item, index) {
					var fQty = parseFloat(String(item.quantity || 0).replace(/,/g, '')) || 0;
					return {
						GatePassReqNo: sRequestId,
						SalesDocument: sSalesDoc,
						GatePassType: "NRGP",
						ItemNo: String((index + 1) * 10).padStart(6, '0'),
						Material: item.type || "",
						MaterialDesc: item.description || "",
						OrderQuantity: fQty.toFixed(3),
						UOM: item.uom || "KG"
					};
				});
			}

			var fnFormatDate = function (d) {
				if (!d) return "";
				if (typeof d === "string") return d.replace(/[^0-9]/g, '').substring(0, 8);
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			var oPayload = {
				GatePassReqNo: sRequestId,
				GatePassType: oRaw.GatePassType || "NRGP",
				SalesDocument: oRaw.SalesDocument || sSalesDoc,
				RequestDate: fnFormatDate(oRaw.RequestDate || oViewModel.getProperty("/requestDate")),
				SoldToParty: oRaw.SoldToParty || "",
				CustomerName: oRaw.CustomerName || "",
				City: oRaw.City || "",
				PostalCode: oRaw.PostalCode || "",
				CustomerGst: oRaw.CustomerGst || "",
				ApprovalReq: sApprovalCode === "AM" ? "AM" : (sApprovalCode === "R" ? "R" : "A"),
				Approval1: sRole === "HOD" ? sApprovalCode : (oRaw.Approval1 || "A1"),
				Approval2: sRole === "Store" ? sApprovalCode : (oRaw.Approval2 || ""),
				VehicleNo: oRaw.VehicleNo || oViewModel.getProperty("/vehicleDetails") || "",
				WeighmentTicket: oRaw.WeighmentTicket || oViewModel.getProperty("/weighmentSlipNo") || "",
				ChallanDate: oRaw.ChallanDate || oViewModel.getProperty("/challanDateTime") || "",
				ScrapArea: oRaw.ScrapArea || oViewModel.getProperty("/collectArea") || "",
				Remarks: sRemarks || oRaw.Remarks || oViewModel.getProperty("/remarks") || "",
				Message: "",
				ScrapReqItmNav: aNavItems
			};

			// Backend ABAP implements Scrap approval via CREATE_DEEP_ENTITY on /ScrapReqHdrSet
			oODataModel.create("/ScrapReqHdrSet", oPayload, {
				success: function (oResponse) {
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

					var sSuccessMsg = (oResponse && oResponse.Message) || ("Request status updated to " + sDisplayStatus);
					MessageBox.success(sSuccessMsg, {
						onClose: function () {
							that.onNavBack();
						}
					});
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Failed to update status.";
					try {
						var oBody = JSON.parse(oError.responseText);
						if (oBody.error && oBody.error.message && oBody.error.message.value) {
							sMsg = oBody.error.message.value;
						}
					} catch (e) {
						try {
							var sRaw = oError.responseText || "";
							var oMatch = sRaw.match(/<message[^>]*>([^<]+)<\/message>/i);
							if (oMatch && oMatch[1]) {
								sMsg = oMatch[1];
							}
						} catch (e2) {}
					}
					MessageBox.error(sMsg);
				}
			});
		}
	});
});
