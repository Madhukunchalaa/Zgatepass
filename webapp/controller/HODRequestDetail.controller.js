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

	return BaseController.extend("zgpms.meilpower.com.controller.HODRequestDetail", {

		onInit: function () {
			// Allow data: URIs in sap.m.Image src (URLListValidator loaded as a dependency above)
			try {
				URLListValidator.add("data");
			} catch (e) {
				try { jQuery.sap.addUrlWhitelist("data"); } catch (e2) { /* ignore */ }
			}

			this._resetModel();
			this.getRouter().getRoute("HODRequestDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs   = oEvent.getParameter("arguments");
			this._sReqNo = decodeURIComponent(oArgs.reqNo  || "");
			this._sType  = decodeURIComponent(oArgs.gpType || "NRGP");

			// Show header fields immediately from the cached list row
			var oTemp = this.getOwnerComponent().getModel("hodTemp");
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
				HODRemarks: "", totalAmount: "0.00", items: [],
				Base64Img1: ""
			};
			var oModel = this.getView().getModel("hod");
			if (oModel) { oModel.setData(oData); } else { this.getView().setModel(new JSONModel(oData), "hod"); }
		},

		_loadDetail: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;

			sap.ui.core.BusyIndicator.show(0);

			// Safest way to read in SAP Gateway when keys might be empty is using $filter.
			// This matches the structure of the successful GET request that returned d.results.
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
					new Filter("GatePassType", FilterOperator.EQ, sType)
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					var oItem = aResults[0];
					if (oItem) {
						that._mapData(oItem);
						// GateReqHdrSet does not always store the image — fetch it from creation entity if missing
						if (!oItem.Base64Img1) {
							that._loadBase64(sReqNo, sType);
						}
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

		// Fetch Base64Img1 from GatePassReqHdrSet (creation entity stores the image)
		_loadBase64: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oHodModel   = this.getView() && this.getView().getModel("hod");
			if (!oODataModel || !oHodModel) { return; }
			var that = this;

			// Attempt direct key read (same 3-field key format)
			oODataModel.read("/GatePassReqHdrSet(GatePassType='" + sType + "')", {
				success: function (oData) {
					var sImg = (oData && oData.Base64Img1) || "";
					if (sImg) {
						oHodModel.setProperty("/Base64Img1", that._formatBase64Image(sImg));
					}
				},
				error: function () {
					// Key read unsupported — try filter approach
					that._loadBase64ByFilter(sReqNo);
				}
			});
		},

		_loadBase64ByFilter: function (sReqNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oHodModel   = this.getView() && this.getView().getModel("hod");
			if (!oODataModel || !oHodModel) { return; }

			oODataModel.read("/GatePassReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					var sImg  = (oItem && oItem.Base64Img1) || "";
					if (sImg) {
						oHodModel.setProperty("/Base64Img1", that._formatBase64Image(sImg));
					}
				},
				error: function () { /* silent — image panel stays hidden */ }
			});
		},

		// Last resort: load full list, find client-side (guaranteed to work, limited fields)
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
					var aResults = oData.results || [];
					var oItem = aResults.find(function (r) {
						return (r.GatePassReqNo === sReqNo) || (r.GatePassreqNo === sReqNo);
					});
					if (oItem) { that._mapData(oItem); }
					// If not found the cached display from hodTemp is still showing
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					// Cached display remains — no redirect
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

			var sStatus = oItem.Status;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			// 1. Primary logic based on Approval fields
			if (s1 === "R"  || s2 === "R")  return "Rejected";
			if (s1 === "AM" || s2 === "AM") return "Amendment";
			if (s2) return "Approved"; // If Store approved, it is fully approved
			if (s1 && !s2) return "Store Approval Pending";
			
			// 2. Fallback to Status field if backend list doesn't return Approval1/Approval2
			if (sStatus === "STORE APPROVAL PENDING") return "Store Approval Pending";
			if (sStatus === "APPROVED") return "Approved";
			if (sStatus === "REJECTED") return "Rejected";
			if (sStatus === "AMENDMENT") return "Amendment";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";
			
			return "Pending";
		},

		_mapData: function (oData) {
			// Keep the raw OData row so _updateStatus can build the full creation-matching payload
			this._oRawData = oData;

			var oModel  = this.getView().getModel("hod");
			var sStatus = this._deriveStatus(oData);

			// Handle field-name variations across GatePassReqHdrSet / GateReqHdrSet
			var sGpDate  = this._formatDate(oData.GpDate || oData.GatePassDate || oData.RequestDate || oData.CreateDate);
			var sFY      = oData.FiscalYear   || oData.Gjahr      || oData.FisYear   || "";
			var sVGST    = oData.VendorGST    || oData.VendorGst  || oData.TaxNo    || "";
			var sCity    = oData.City         || oData.City1      || "";
			var sZip     = oData.ZipCode      || oData.Pstlz      || "";
			var sVehNo   = oData.VehicleNo    || oData.Vehicle    || oData.Vehicleno || "";
			var sMod     = oData.ModeOfDispatch || oData.ModeDispatch || oData.TransportMode || "";
			var sRmk     = oData.Remarks      || oData.Remark     || "";
			var sHODRmk  = oData.HODRemarks   || oData.HodRemarks || "";
			var sDept    = oData.Department   || "";
			var sVndrNm  = oData.VendorName   || oData.Vendor1    || oData.Name1    || "";
			var sReqNo   = oData.GatePassReqNo || oData.GatePassreqNo || "";

			oModel.setProperty("/GatePassReqNo",  sReqNo);
			oModel.setProperty("/GatePassType",   oData.GatePassType  || "");
			oModel.setProperty("/Status",         sStatus);
			oModel.setProperty("/GpDate",         sGpDate);
			oModel.setProperty("/Plant",          oData.Plant         || "");
			oModel.setProperty("/FiscalYear",     sFY);
			oModel.setProperty("/Department",     sDept);
			oModel.setProperty("/VendorName",     sVndrNm);
			oModel.setProperty("/VendorGST",      sVGST);
			oModel.setProperty("/VendorAddress",  [sCity, sZip].filter(Boolean).join(", "));
			oModel.setProperty("/VehicleNo",      sVehNo);
			oModel.setProperty("/ModeOfDispatch", sMod);
			oModel.setProperty("/Remarks",        sRmk);
			oModel.setProperty("/HODRemarks",     sHODRmk);

			// Base64 image — normalise to a valid data URL.
			var sRawImg = oData.Base64Img1 || "";
			if (sRawImg) {
				// Format the Base64 string into a safe Blob URL to bypass UI5 data URI security blocks
				var sFormattedImage = this._formatBase64ToBlobUrl(sRawImg);
				oModel.setProperty("/Base64Img1", sFormattedImage);
			}
			// If sRawImg is empty, leave whatever is already in the model untouched.

			// Items — populated when the navigation property is expanded
			var aRaw = (oData.GateReqItmNav && oData.GateReqItmNav.results) ||
			           (oData.GateReqItemNav && oData.GateReqItemNav.results) || [];
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

		_formatBase64ToBlobUrl: function(sRawImg) {
			var sImg = sRawImg || "";
			if (!sImg) return "";
			
			sImg = sImg.replace(/[\n\r\s]/g, "");
			if (sImg.length < 50) return "";

			// --- SAP XSTRING → hex-encoded binary ---
			// Do NOT require even length here — odd-length is trimmed below
			var sPossibleHex = sImg.replace(/^0x/i, "");
			var isHex = /^[0-9A-Fa-f]+$/.test(sPossibleHex);

			if (isHex && sPossibleHex.length >= 50) {
				try {
					var upperImg = sPossibleHex.toUpperCase();
					var startIndex = 0;
					var mimeType = "image/jpeg";

					var jpegIdx = upperImg.indexOf("FFD8FF");
					var pngIdx  = upperImg.indexOf("89504E47");
					var gifIdx  = upperImg.indexOf("47494638");

					var indices = [
						{ mime: "image/jpeg", idx: jpegIdx },
						{ mime: "image/png",  idx: pngIdx  },
						{ mime: "image/gif",  idx: gifIdx  }
					].filter(function(item) { return item.idx !== -1; });

					if (indices.length > 0) {
						indices.sort(function(a, b) { return a.idx - b.idx; });
						startIndex = indices[0].idx;
						mimeType   = indices[0].mime;
					}

					var actualHex = sPossibleHex.substring(startIndex);
					if (actualHex.length % 2 !== 0) {
						actualHex = actualHex.substring(0, actualHex.length - 1);
					}

					// Hex → Uint8Array → base64 data URL
					// Chunk at 3072 bytes (divisible by 3) so btoa() never adds mid-string padding
					var numBytes = actualHex.length / 2;
					var byteArray = new Uint8Array(numBytes);
					for (var i = 0; i < numBytes; i++) {
						byteArray[i] = parseInt(actualHex.substr(i * 2, 2), 16);
					}
					var b64 = "";
					var BCHUNK = 3072;
					for (var j = 0; j < byteArray.length; j += BCHUNK) {
						var slice = byteArray.subarray(j, j + BCHUNK);
						var bStr = "";
						for (var k = 0; k < slice.length; k++) {
							bStr += String.fromCharCode(slice[k]);
						}
						b64 += btoa(bStr);
					}
					return "data:" + mimeType + ";base64," + b64;
				} catch (eHex) {
					// Fall through to base64 logic
				}
			}

			// --- Base64 / garbled-prefix fallback ---
			var sBase64Img = sImg.replace(/ /g, "+");
			if (sBase64Img.indexOf("data:") === 0) return sBase64Img;

			var iJpeg = sBase64Img.indexOf("/9j/");
			var iPng  = sBase64Img.indexOf("iVBORw");
			if (iJpeg !== -1) {
				return "data:image/jpeg;base64," + sBase64Img.substring(iJpeg);
			} else if (iPng !== -1) {
				return "data:image/png;base64," + sBase64Img.substring(iPng);
			}
			return "data:image/jpeg;base64," + sBase64Img;
		},

		onImagePress: function (oEvent) {
			var oImage = oEvent.getSource();
			var sSrc = oImage.getSrc();
			if (!sSrc) return;

			if (!this._oImageDialog) {
				this._oImageDialog = new sap.m.Dialog({
					title: "Attachment Preview",
					stretch: true,
					content: new sap.m.Image({
						src: sSrc,
						width: "100%",
						densityAware: false
					}),
					endButton: new sap.m.Button({
						text: "Close",
						press: function () {
							this._oImageDialog.close();
						}.bind(this)
					})
				});
				this.getView().addDependent(this._oImageDialog);
			} else {
				this._oImageDialog.getContent()[0].setSrc(sSrc);
			}

			this._oImageDialog.open();
		},

		onApprove: function () {
			var sRemarks = this.getView().getModel("hod").getProperty("/HODRemarks") || "";
			sap.m.MessageBox.confirm("Approve this Gate Pass Request?", {
				title: "Confirm Approval",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("A1", "Store Approval Pending", sRemarks); }
				}.bind(this)
			});
		},

		onReject: function () {
			var sRemarks = this.getView().getModel("hod").getProperty("/HODRemarks") || "";
			sap.m.MessageBox.confirm("Reject this Gate Pass Request?", {
				title: "Confirm Rejection",
				onClose: function (sAction) {
					if (sAction === sap.m.MessageBox.Action.OK) { this._updateStatus("R", "Rejected", sRemarks); }
				}.bind(this)
			});
		},

		onAmend: function () {
			var sRemarks = this.getView().getModel("hod").getProperty("/HODRemarks") || "";
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

			// Build full payload matching the creation structure so CREATE_ENTITY
			// receives all original request fields plus the HOD approval code.
			var oRaw = this._oRawData || {};
			var aRawItems = (oRaw.GateReqItmNav && oRaw.GateReqItmNav.results) ||
			                (oRaw.GateReqItemNav && oRaw.GateReqItemNav.results) || [];

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
				ApprovalReq:    sApprovalCode === "AM" ? "AM" : (oRaw.ApprovalReq || ""),
				Approval1:      sApprovalCode,
				Approval2:      oRaw.Approval2 || "",
				Department:     oRaw.Department     || "",
				VehicleNo:      oRaw.VehicleNo      || "",
				ModeOfDispatch: oRaw.ModeOfDispatch || "",
				Remarks:        oRaw.Remarks        || "",
				ReturnableDate: oRaw.ReturnableDate || "",
				Base64Img1:     oRaw.Base64Img1     || "",
				HODRemarks:     sRemarks            || "",
				GatePassReqNo:  this._sReqNo,
				GateReqItemNav: aRawItems.map(function (it) {
					return {
						GatePassType:      it.GatePassType      || "",
						ItemNo:            it.ItemNo            || "",
						Material:          it.Material          || "",
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
						sap.ui.core.BusyIndicator.hide();
						that.getView().getModel("hod").setProperty("/Status", sDisplayStatus);
						var sMsg = (oData && oData.Message) || ("Request " + sDisplayStatus + " successfully.");
						sap.m.MessageBox.success(sMsg, {
							onClose: function () { that.getRouter().navTo("GatePassList"); }
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

		onNavBack: function () {
			this.getRouter().navTo("GatePassList");
		}

	});
});
