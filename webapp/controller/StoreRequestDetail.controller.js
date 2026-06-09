sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/security/URLListValidator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, URLListValidator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.StoreRequestDetail", {

		onInit: function () {
			try {
				URLListValidator.add("data");
			} catch (e) {
				try { jQuery.sap.addUrlWhitelist("data"); } catch (e2) { /* ignore */ }
			}
			this._resetModel();
			this.getRouter().getRoute("StoreRequestDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs    = oEvent.getParameter("arguments");
			this._sReqNo = decodeURIComponent(oArgs.reqNo  || "");
			this._sType  = decodeURIComponent(oArgs.gpType || "NRGP");

			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (oTemp) {
				var oRow = oTemp.getData();
				if (oRow && (oRow.GatePassReqNo === this._sReqNo || oRow.GatePassreqNo === this._sReqNo)) {
					this._mapData(oRow);
				}
			}

			if (this._sReqNo) {
				this._loadDetail(this._sReqNo, this._sType);
			}
		},

		_resetModel: function () {
			var oData = {
				GatePassReqNo: "", GatePassType: "", Status: "",
				GpDate: "", Plant: "", FiscalYear: "", Department: "",
				VendorName: "", VendorGST: "", VendorAddress: "",
				VehicleNo: "", ModeOfDispatch: "", Remarks: "",
				HODRemarks: "", STORERemarks: "", totalAmount: "0.00",
				items: [], Base64Img1: ""
			};
			var oModel = this.getView().getModel("store");
			if (oModel) { oModel.setData(oData); } else { this.getView().setModel(new JSONModel(oData), "store"); }
		},

		_loadDetail: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
					new Filter("GatePassType",  FilterOperator.EQ, sType)
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = (oData.results || [])[0];
					if (oItem) {
						that._mapData(oItem);
					} else {
						that._loadFromList(sReqNo, sType);
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					that._loadFromList(sReqNo, sType);
				}
			});
		},

		_loadFromList: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassType", FilterOperator.EQ, sType),
					new Filter("Status",       FilterOperator.EQ, "All")
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oItem = (oData.results || []).find(function (r) {
						return (r.GatePassReqNo === sReqNo) || (r.GatePassreqNo === sReqNo);
					});
					if (oItem) { that._mapData(oItem); }
				},
				error: function () { sap.ui.core.BusyIndicator.hide(); }
			});
		},

		_deriveStatus: function (oItem) {
			var s1 = oItem.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = oItem.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = oItem.Status;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			if (s1 === "R"  || s2 === "R")  return "Rejected";
			if (s1 === "AM" || s2 === "AM") return "Amendment";
			if (s1 && s2) return "Approved";
			if (s1 && !s2) return "Store Approval Pending";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";
			return "Pending";
		},

		_mapData: function (oData) {
			this._oRawData = oData;

			var oModel  = this.getView().getModel("store");
			var sStatus = this._deriveStatus(oData);

			var sGpDate = this._formatDate(oData.GpDate || oData.GatePassDate || oData.RequestDate || oData.CreateDate);
			var sFY     = oData.FiscalYear   || oData.Gjahr     || oData.FisYear  || "";
			var sVGST   = oData.VendorGST    || oData.VendorGst || oData.TaxNo    || "";
			var sCity   = oData.City         || oData.City1     || "";
			var sZip    = oData.ZipCode      || oData.Pstlz     || "";
			var sVehNo  = oData.VehicleNo    || oData.Vehicle   || oData.Vehicleno || "";
			var sMod    = oData.ModeOfDispatch || oData.ModeDispatch || oData.TransportMode || "";
			var sRmk    = oData.Remarks      || oData.Remark    || "";
			var sReqNo  = oData.GatePassReqNo || oData.GatePassreqNo || "";

			oModel.setProperty("/GatePassReqNo",  sReqNo);
			oModel.setProperty("/GatePassType",   oData.GatePassType  || "");
			oModel.setProperty("/Status",         sStatus);
			oModel.setProperty("/GpDate",         sGpDate);
			oModel.setProperty("/Plant",          oData.Plant         || "");
			oModel.setProperty("/FiscalYear",     sFY);
			oModel.setProperty("/Department",     oData.Department    || "");
			oModel.setProperty("/VendorName",     oData.VendorName    || oData.Vendor1 || oData.Name1 || "");
			oModel.setProperty("/VendorGST",      sVGST);
			oModel.setProperty("/VendorAddress",  [sCity, sZip].filter(Boolean).join(", "));
			oModel.setProperty("/VehicleNo",      sVehNo);
			oModel.setProperty("/ModeOfDispatch", sMod);
			oModel.setProperty("/Remarks",        sRmk);
			oModel.setProperty("/HODRemarks",     oData.HODRemarks    || oData.HodRemarks   || "");
			oModel.setProperty("/STORERemarks",   oData.STORERemarks  || oData.StoreRemarks || "");

			var sRawImg = oData.Base64Img1 || "";
			if (sRawImg) {
				oModel.setProperty("/Base64Img1", this._formatBase64ToBlobUrl(sRawImg));
			}

			var aRaw = (oData.GateReqItmNav  && oData.GateReqItmNav.results) ||
			           (oData.GateReqItemNav  && oData.GateReqItemNav.results) || [];
			var aItems = aRaw.map(function (it, i) {
				var fQty    = parseFloat(it.RequestedQuantity || it.Quantity   || 0);
				var fRate   = parseFloat(it.ItemNetPrice      || 0);
				var fAmount = parseFloat(it.Totalvalue        || (fQty * fRate).toFixed(2));
				return {
					sno:          i + 1,
					materialName: it.MaterialDesc || it.HSNDesc || it.Description || "",
					hsnCode:      it.HSNCode      || "",
					uom:          it.UOM          || "",
					quantity:     fQty,
					rate:         fRate,
					amount:       fAmount
				};
			});
			oModel.setProperty("/items", aItems);

			var fTotal = aItems.reduce(function (s, it) { return s + parseFloat(it.amount || 0); }, 0);
			oModel.setProperty("/totalAmount", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "") { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
				return vDate.slice(6, 8) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(0, 4);
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.toLocaleDateString("en-GB").split("/").join("-");
			}
			return String(vDate || "");
		},

		_formatBase64ToBlobUrl: function (sRawImg) {
			var sImg = sRawImg || "";
			if (!sImg) return "";
			sImg = sImg.replace(/[\n\r\s]/g, "");
			if (sImg.length < 50) return "";

			var sPossibleHex = sImg.replace(/^0x/i, "");
			var isHex = /^[0-9A-Fa-f]+$/.test(sPossibleHex);

			if (isHex && sPossibleHex.length >= 50) {
				try {
					var upper = sPossibleHex.toUpperCase();
					var startIndex = 0;
					var mimeType  = "image/jpeg";
					var indices = [
						{ mime: "image/jpeg", idx: upper.indexOf("FFD8FF")   },
						{ mime: "image/png",  idx: upper.indexOf("89504E47") },
						{ mime: "image/gif",  idx: upper.indexOf("47494638") }
					].filter(function (x) { return x.idx !== -1; });

					if (indices.length > 0) {
						indices.sort(function (a, b) { return a.idx - b.idx; });
						startIndex = indices[0].idx;
						mimeType   = indices[0].mime;
					}

					var actualHex = sPossibleHex.substring(startIndex);
					if (actualHex.length % 2 !== 0) { actualHex = actualHex.substring(0, actualHex.length - 1); }

					var numBytes  = actualHex.length / 2;
					var byteArray = new Uint8Array(numBytes);
					for (var i = 0; i < numBytes; i++) {
						byteArray[i] = parseInt(actualHex.substr(i * 2, 2), 16);
					}
					var b64 = "";
					var BCHUNK = 3072;
					for (var j = 0; j < byteArray.length; j += BCHUNK) {
						var slice = byteArray.subarray(j, j + BCHUNK);
						var bStr  = "";
						for (var k = 0; k < slice.length; k++) { bStr += String.fromCharCode(slice[k]); }
						b64 += btoa(bStr);
					}
					return "data:" + mimeType + ";base64," + b64;
				} catch (e) { /* fall through */ }
			}

			var sB64 = sImg.replace(/ /g, "+");
			if (sB64.indexOf("data:") === 0) return sB64;
			var iJpeg = sB64.indexOf("/9j/");
			var iPng  = sB64.indexOf("iVBORw");
			if (iJpeg !== -1) { return "data:image/jpeg;base64," + sB64.substring(iJpeg); }
			if (iPng  !== -1) { return "data:image/png;base64,"  + sB64.substring(iPng);  }
			return "data:image/jpeg;base64," + sB64;
		},

		onApprove: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Approve this Gate Pass Request?", {
				title: "Confirm Approval",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("A2", "Approved", sRemarks); }
				}.bind(this)
			});
		},

		onReject: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Reject this Gate Pass Request?", {
				title: "Confirm Rejection",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("R", "Rejected", sRemarks); }
				}.bind(this)
			});
		},

		onAmend: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			sap.m.MessageBox.confirm("Send this request back for Amendment?", {
				title: "Confirm Amendment",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("AM", "Amendment", sRemarks); }
				}.bind(this)
			});
		},

		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				sap.m.MessageBox.error("SAP system is not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			var oRaw = this._oRawData || {};
			var aRawItems = (oRaw.GateReqItmNav  && oRaw.GateReqItmNav.results) ||
			                (oRaw.GateReqItemNav  && oRaw.GateReqItemNav.results) || [];

			var oPayload = {
				GatePassType:   oRaw.GatePassType   || this._sType,
				Cocode:         oRaw.CoCode         || oRaw.Cocode        || "",
				Plant:          oRaw.Plant          || "",
				FiscalYear:     oRaw.FiscalYear     || "",
				GpDate:         oRaw.GpDate         || oRaw.CreatedOn     || "",
				Vendor:         oRaw.Vendor         || "",
				VendorName:     oRaw.VendorName     || "",
				VendorGST:      oRaw.VendorGST      || oRaw.VendorGst     || "",
				ZipCode:        oRaw.ZipCode        || "",
				City:           oRaw.City           || "",
				ApprovalReq:    oRaw.ApprovalReq    || "",
				Approval1:      oRaw.Approval1      || "",
				Approval2:      sApprovalCode,
				Department:     oRaw.Department     || "",
				VehicleNo:      oRaw.VehicleNo      || "",
				ModeOfDispatch: oRaw.ModeOfDispatch || "",
				Remarks:        oRaw.Remarks        || "",
				ReturnableDate: oRaw.ReturnableDate || "",
				Base64Img1:     oRaw.Base64Img1     || "",
				HODRemarks:     oRaw.HODRemarks     || "",
				STORERemarks:   sRemarks            || "",
				GatePassReqNo:  this._sReqNo,
				GateReqItemNav: aRawItems.map(function (it) {
					return {
						GatePassType:      it.GatePassType      || "",
						ItemNo:            it.ItemNo            || "",
						Material:          it.Material         || "",
						MaterialDesc:      it.MaterialDesc      || "",
						HSNCode:           it.HSNCode           || "",
						HSNDesc:           it.HSNDesc           || "",
						UOM:               it.UOM               || "",
						ItemNetPrice:      it.ItemNetPrice      || "0.00",
						RequestedQuantity: it.RequestedQuantity || "0.000",
						Totalvalue:        it.Totalvalue        || "0.00",
						Remarks:           it.Remarks           || ""
					};
				})
			};

			oODataModel.create(
				"/GatePassReqHdrSet",
				oPayload,
				{
					success: function (oData) {
						that.getView().getModel("store").setProperty("/Status", sDisplayStatus);
						
						sap.ui.core.BusyIndicator.hide();
						var sMsg = (oData && oData.Message) || ("Request " + sDisplayStatus + " successfully.");
						
						sap.m.MessageBox.success(sMsg, {
							onClose: function () { 
								if (sApprovalCode === "A2") {
									// Navigate to OutGatePass after approval so they can generate it manually
									that.getRouter().navTo("OutGatePass", { 
										reqNo: encodeURIComponent(that._sReqNo || oRaw.GatePassreqNo || oRaw.GatePassReqNo || ""), 
										gpNo: "-" 
									});
								} else {
									that.getRouter().navTo("GatePassList"); 
								}
							}
						});
					},
					error: function (oErr) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to update request status.";
						try {
							var oBody = JSON.parse(oErr.responseText);
							var aInner = oBody.error && oBody.error.innererror && oBody.error.innererror.errordetails;
							if (aInner && aInner[0]) { sMsg = aInner[0].message; }
							else if (oBody.error && oBody.error.message && oBody.error.message.value) {
								sMsg = oBody.error.message.value;
							}
						} catch (e) { /* use default */ }
						sap.m.MessageBox.error(sMsg);
					}
				}
			);
		},

		onImagePress: function (oEvent) {
			var sSrc = oEvent.getSource().getSrc();
			if (!sSrc) return;
			if (!this._oImageDialog) {
				this._oImageDialog = new sap.m.Dialog({
					title: "Attachment Preview",
					stretch: true,
					content: new sap.m.Image({ src: sSrc, width: "100%", densityAware: false }),
					endButton: new sap.m.Button({
						text: "Close",
						press: function () { this._oImageDialog.close(); }.bind(this)
					})
				});
				this.getView().addDependent(this._oImageDialog);
			} else {
				this._oImageDialog.getContent()[0].setSrc(sSrc);
			}
			this._oImageDialog.open();
		},

		onNavBack: function () {
			this.getRouter().navTo("GatePassList");
		}

	});
});
