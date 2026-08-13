sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/security/URLListValidator",
	"sap/ui/core/BusyIndicator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, URLListValidator, BusyIndicator) {
	"use strict";

	/**
	 * StoreRequestDetail Controller
	 * Manages Store Approval, Rejection, and Amendment workflows for Gate Pass Requests.
	 */
	return BaseController.extend("zgpms.meilpower.com.controller.StoreRequestDetail", {

		/* =========================================================== */
		/* LIFECYCLE & ROUTING HOOKS                                   */
		/* =========================================================== */

		onInit: function () {
			try {
				URLListValidator.add("data");
			} catch (e) {
				try { jQuery.sap.addUrlWhitelist("data"); } catch (e2) { /* ignore fallback */ }
			}
			this._resetModel();
			this.getRouter().getRoute("StoreRequestDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs = oEvent.getParameter("arguments");
			this._sReqNo = decodeURIComponent(oArgs.reqNo || "");
			this._sType  = decodeURIComponent(oArgs.gpType || "NRGP");

			// 1. Check temporary cache model for instant rendering
			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (oTemp) {
				var oRow = oTemp.getData();
				if (oRow && (oRow.GatePassReqNo === this._sReqNo || oRow.GatePassreqNo === this._sReqNo)) {
					this._mapData(oRow);
				}
			}

			// 2. Fetch fresh data from backend
			if (this._sReqNo) {
				this._loadDetail(this._sReqNo, this._sType);
			}
		},

		/**
		 * Resets the local JSON model data structure to default empty state.
		 */
		_resetModel: function () {
			var oData = {
				GatePassReqNo: "", GatePassType: "", Status: "",
				GpDate: "", Plant: "", FiscalYear: "", Department: "",
				VendorName: "", VendorGST: "", VendorAddress: "",
				DueDate: "",
				VehicleNo: "", ModeOfDispatch: "", Remarks: "",
				HODRemarks: "", STORERemarks: "", StoreRemarks: "", totalAmount: "0.00",
				items: [],
				Base64Img1: "", Fname: "", Ftype: "", hasAttachment1: false, isImage1: false, isPdf1: false,
				Base64Img2: "", Fname2: "", Ftype2: "", hasAttachment2: false, isImage2: false, isPdf2: false,
				hasAttachment: false
			};
			var oModel = this.getView().getModel("store");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "store");
			}
		},

		/* =========================================================== */
		/* DATA FETCHING & NORMALIZATION                               */
		/* =========================================================== */

		/**
		 * Loads details for a single Gate Pass request from OData backend.
		 */
		_loadDetail: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }
			var that = this;

			BusyIndicator.show(0);
			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo),
					new Filter("GatePassType",  FilterOperator.EQ, sType)
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					BusyIndicator.hide();
					var oItem = (oData.results || [])[0];
					if (oItem) {
						that._mapData(oItem);

						// Fetch HOD Remarks from creation entity if missing
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (!sHOD) {
							that._loadHODRemarks(sReqNo, sType);
						}

						// Fetch attachments if missing
						var sCheckImg1 = oItem.Base64Img1 || oItem.Base64img1 || "";
						var sCheckImg2 = oItem.Base64Img2 || oItem.Base64img2 || "";
						if (!sCheckImg1 || !sCheckImg2) {
							that._loadBase64(sReqNo, sType);
						}
					} else {
						that._loadFromList(sReqNo, sType);
					}
				},
				error: function () {
					BusyIndicator.hide();
					that._loadFromList(sReqNo, sType);
				}
			});
		},

		/**
		 * Helper to fetch HODRemarks from GatePassReqHdrSet if primary entity didn't return them.
		 */
		_loadHODRemarks: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }

			var that = this;
			var sKeyPath = "/GatePassReqHdrSet(GatePassReqNo='" + sReqNo + "',GatePassType='" + sType + "')";
			
			oODataModel.read(sKeyPath, {
				success: function (oData) {
					if (oData) {
						var sHOD = oData.HODRemarks || oData.HodRemarks || "";
						if (sHOD) {
							oStoreModel.setProperty("/HODRemarks", sHOD);
							if (that._oRawData) { that._oRawData.HODRemarks = sHOD; }
							return;
						}
					}
					that._loadHODRemarksByFilter(sReqNo, sType);
				},
				error: function () {
					that._loadHODRemarksByFilter(sReqNo, sType);
				}
			});
		},

		_loadHODRemarksByFilter: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }

			var aFilters = [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)];
			if (sType) { aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType)); }

			var that = this;
			oODataModel.read("/GatePassReqHdrSet", {
				filters: aFilters,
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					if (oItem) {
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (sHOD) {
							oStoreModel.setProperty("/HODRemarks", sHOD);
							if (that._oRawData) { that._oRawData.HODRemarks = sHOD; }
						}
					}
				},
				error: function (oError) {
					console.error("Filter read for HODRemarks failed", oError);
				}
			});
		},

		_loadFromList: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;
			BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [
					new Filter("GatePassType", FilterOperator.EQ, sType),
					new Filter("Status",       FilterOperator.EQ, "All")
				],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					BusyIndicator.hide();
					var oItem = (oData.results || []).find(function (r) {
						return (r.GatePassReqNo === sReqNo) || (r.GatePassreqNo === sReqNo);
					});
					if (oItem) {
						that._mapData(oItem);
						var sHOD = oItem.HODRemarks || oItem.HodRemarks || "";
						if (!sHOD) { that._loadHODRemarks(sReqNo, sType); }
						var sCheckImg1 = oItem.Base64Img1 || oItem.Base64img1 || "";
						var sCheckImg2 = oItem.Base64Img2 || oItem.Base64img2 || "";
						if (!sCheckImg1 || !sCheckImg2) { that._loadBase64(sReqNo, sType); }
					}
				},
				error: function () { BusyIndicator.hide(); }
			});
		},

		_loadBase64: function (sReqNo, sType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }
			var that = this;

			var sKeyPath = "/GatePassReqHdrSet(GatePassReqNo='" + sReqNo + "',GatePassType='" + sType + "')";
			oODataModel.read(sKeyPath, {
				success: function (oData) {
					if (oData && (oData.Base64Img1 || oData.Base64img1 || oData.Base64Img2 || oData.Base64img2)) {
						that._processLoadedAttachments(oData, oStoreModel);
					} else {
						that._loadBase64ByFilter(sReqNo);
					}
				},
				error: function () {
					that._loadBase64ByFilter(sReqNo);
				}
			});
		},

		_loadBase64ByFilter: function (sReqNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oStoreModel = this.getView() && this.getView().getModel("store");
			if (!oODataModel || !oStoreModel) { return; }
			var that = this;

			oODataModel.read("/GatePassReqHdrSet", {
				filters: [new Filter("GatePassReqNo", FilterOperator.EQ, sReqNo)],
				success: function (oData) {
					var oItem = oData.results && oData.results[0];
					if (oItem && (oItem.Base64Img1 || oItem.Base64img1 || oItem.Base64Img2 || oItem.Base64img2)) {
						that._processLoadedAttachments(oItem, oStoreModel);
					}
				},
				error: function (oError) {
					console.error("Filter OData read on /GatePassReqHdrSet failed: ", oError);
				}
			});
		},

		_processLoadedAttachments: function (oData, oModel) {
			if (!oData || !oModel) return;

			// Attachment 1
			var sImg1 = oData.Base64Img1 || oData.Base64img1 || "";
			var sFname1 = oData.FILENAME || oData.Filename || oData.FileName || oData.Fname || "";
			var sFtype1 = (oData.FILETYPE || oData.Filetype || oData.FileType || oData.Ftype || "").toUpperCase().trim();

			if (sImg1) {
				oModel.setProperty("/Base64Img1", this._formatBase64ToBlobUrl(sImg1));
				oModel.setProperty("/hasAttachment1", true);
				if (!sFtype1) { sFtype1 = this._detectFileType(sImg1); }
				if (sFtype1) {
					sFtype1 = sFtype1.toUpperCase().trim();
					if (sFtype1.indexOf("PDF") !== -1 || sFtype1 === "APPLICATION/PDF") sFtype1 = "PDF";
					else if (sFtype1.indexOf("PNG") !== -1 || sFtype1 === "IMAGE/PNG") sFtype1 = "PNG";
					else if (sFtype1.indexOf("JPG") !== -1 || sFtype1.indexOf("JPEG") !== -1 || sFtype1 === "IMAGE/JPEG") sFtype1 = "JPG";
					else if (sFtype1.indexOf("DOC") !== -1 || sFtype1.indexOf("WORD") !== -1 || sFtype1.indexOf("OFFICEDOCUMENT") !== -1) sFtype1 = "DOCX";
				}
				var sDisplayFname1 = sFname1;
				if (sDisplayFname1) {
					if (sDisplayFname1.indexOf(".") === -1 && sFtype1) sDisplayFname1 += "." + sFtype1.toLowerCase();
				} else if (sFtype1) {
					sDisplayFname1 = "attachment1." + sFtype1.toLowerCase();
				}
				oModel.setProperty("/Fname", sDisplayFname1);
				oModel.setProperty("/Ftype", sFtype1);

				var bIsImage1 = !sFtype1 || ["JPG", "JPEG", "PNG", "GIF"].indexOf(sFtype1) !== -1;
				var bIsPdf1 = sFtype1 === "PDF";
				oModel.setProperty("/isImage1", bIsImage1);
				oModel.setProperty("/isPdf1", bIsPdf1);
			} else {
				oModel.setProperty("/Base64Img1", "");
				oModel.setProperty("/hasAttachment1", false);
				oModel.setProperty("/Fname", "");
				oModel.setProperty("/Ftype", "");
				oModel.setProperty("/isImage1", false);
				oModel.setProperty("/isPdf1", false);
			}

			// Attachment 2
			var sImg2 = oData.Base64Img2 || oData.Base64img2 || "";
			var sFname2 = oData.FILENAME2 || oData.Filename2 || oData.FileName2 || oData.Fname2 || "";
			var sFtype2 = (oData.FILETYPE2 || oData.Filetype2 || oData.FileType2 || oData.Ftype2 || "").toUpperCase().trim();

			if (sImg2) {
				oModel.setProperty("/Base64Img2", this._formatBase64ToBlobUrl(sImg2));
				oModel.setProperty("/hasAttachment2", true);
				if (!sFtype2) { sFtype2 = this._detectFileType(sImg2); }
				if (sFtype2) {
					sFtype2 = sFtype2.toUpperCase().trim();
					if (sFtype2.indexOf("PDF") !== -1 || sFtype2 === "APPLICATION/PDF") sFtype2 = "PDF";
					else if (sFtype2.indexOf("PNG") !== -1 || sFtype2 === "IMAGE/PNG") sFtype2 = "PNG";
					else if (sFtype2.indexOf("JPG") !== -1 || sFtype2.indexOf("JPEG") !== -1 || sFtype2 === "IMAGE/JPEG") sFtype2 = "JPG";
					else if (sFtype2.indexOf("DOC") !== -1 || sFtype2.indexOf("WORD") !== -1 || sFtype2.indexOf("OFFICEDOCUMENT") !== -1) sFtype2 = "DOCX";
				}
				var sDisplayFname2 = sFname2;
				if (sDisplayFname2) {
					if (sDisplayFname2.indexOf(".") === -1 && sFtype2) sDisplayFname2 += "." + sFtype2.toLowerCase();
				} else if (sFtype2) {
					sDisplayFname2 = "attachment2." + sFtype2.toLowerCase();
				}
				oModel.setProperty("/Fname2", sDisplayFname2);
				oModel.setProperty("/Ftype2", sFtype2);

				var bIsImage2 = !sFtype2 || ["JPG", "JPEG", "PNG", "GIF"].indexOf(sFtype2) !== -1;
				var bIsPdf2 = sFtype2 === "PDF";
				oModel.setProperty("/isImage2", bIsImage2);
				oModel.setProperty("/isPdf2", bIsPdf2);
			} else {
				oModel.setProperty("/Base64Img2", "");
				oModel.setProperty("/hasAttachment2", false);
				oModel.setProperty("/Fname2", "");
				oModel.setProperty("/Ftype2", "");
				oModel.setProperty("/isImage2", false);
				oModel.setProperty("/isPdf2", false);
			}

			oModel.setProperty("/hasAttachment", !!(sImg1 || sImg2));
		},

		_deriveStatus: function (oItem) {
			var fnGetProp = function (obj, sProp) {
				if (!obj) return "";
				var sTarget = sProp.toLowerCase();
				for (var key in obj) {
					if (key.toLowerCase() === sTarget) {
						return obj[key];
					}
				}
				return "";
			};

			var s1 = fnGetProp(oItem, "Approval1");
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = fnGetProp(oItem, "Approval2");
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = fnGetProp(oItem, "Status");
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			var sAppReq = fnGetProp(oItem, "ApprovalReq");
			sAppReq = String(sAppReq).trim().toUpperCase();

			var sAmmend = fnGetProp(oItem, "StoreAmmend");
			sAmmend = String(sAmmend || "").trim().toUpperCase();

			if (s1 === "R" || s2 === "R" || sAppReq === "R" || sStatus === "REJECTED") {
				return "Rejected";
			}
			if (sAmmend === "AM" || s1 === "AM" || s2 === "AM"  || sStatus === "AM" || sStatus === "AMENDMENT") {
				return "Amendment";
			}
			if (s2 || sStatus === "APPROVED") {
				return "Approved";
			}
			var sStoreRemarks = oItem.STORERemarks || oItem.StoreRemarks || "";
			if (sStoreRemarks && String(sStoreRemarks).trim() !== "" && String(sStoreRemarks) !== "null") {
				return "Approved";
			}
			if (s1 && s1 !== "X" && s1 !== "PENDING" && !s2) {
				return "Store Approval Pending";
			}

			if (sStatus === "STORE APPROVAL PENDING") return "Store Approval Pending";
			if (sStatus === "APPROVED") return "Approved";
			if (sStatus === "REJECTED") return "Rejected";
			if (sStatus === "AMENDMENT") return "Amendment";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";

			return "Pending";
		},

		_mapData: function (oData) {
			this._oRawData = oData;

			var oModel  = this.getView().getModel("store");
			var sStatus = this._deriveStatus(oData);

			var sGpDate = this._formatDate(oData.GpDate || oData.Gpdate || oData.GPDate || oData.GatePassDate || oData.GatepassDate || oData.RequestDate || oData.Requestdate || oData.CreateDate || oData.CreatedOn || oData.Erdat || oData.Aedat);
			if (!sGpDate) {
				sGpDate = this._formatDate(new Date());
			}
			var sFY     = oData.FiscalYear   || oData.Gjahr     || oData.FisYear  || String(new Date().getFullYear());
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
			oModel.setProperty("/DueDate",        this._formatDate(oData.ReturnableDate || oData.DueDate || ""));
			oModel.setProperty("/VehicleNo",      sVehNo);
			oModel.setProperty("/ModeOfDispatch", sMod);
			oModel.setProperty("/Remarks",        sRmk);
			oModel.setProperty("/HODRemarks",     oData.HODRemarks    || oData.HodRemarks   || "");
			oModel.setProperty("/STORERemarks",   oData.STORERemarks  || oData.StoreRemarks || "");
			oModel.setProperty("/StoreRemarks",   oData.STORERemarks  || oData.StoreRemarks || "");

			var sRawImg1 = oData.Base64Img1 || oData.Base64img1 || "";
			var sRawImg2 = oData.Base64Img2 || oData.Base64img2 || "";
			var sFname1  = oData.FILENAME   || oData.Filename    || oData.FileName   || oData.Fname || "";
			var sFtype1  = (oData.FILETYPE  || oData.Filetype    || oData.FileType   || oData.Ftype || "").toUpperCase().trim();
			var sFname2  = oData.FILENAME2  || oData.Filename2   || oData.FileName2  || oData.Fname2 || "";
			var sFtype2  = (oData.FILETYPE2 || oData.Filetype2   || oData.FileType2  || oData.Ftype2 || "").toUpperCase().trim();
			
			this._processLoadedAttachments({
				Base64Img1: sRawImg1, Fname: sFname1, Ftype: sFtype1,
				Base64Img2: sRawImg2, Fname2: sFname2, Ftype2: sFtype2
			}, oModel);

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

		/* =========================================================== */
		/* USER ACTIONS (APPROVE, REJECT, AMEND)                      */
		/* =========================================================== */

		/**
		 * Fired when Store User clicks 'Approve' button.
		 */
		onApprove: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			var that = this;

			MessageBox.confirm("Approve this Gate Pass Request?", {
				title: "Confirm Approval",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._updateStatus("A2", "Approved", sRemarks);
					}
				}
			});
		},

		/**
		 * Fired when Store User clicks 'Reject' button.
		 */
		onReject: function () {
			var sRemarks = this.getView().getModel("store").getProperty("/STORERemarks") || "";
			var that = this;

			MessageBox.confirm("Reject this Gate Pass Request?", {
				title: "Confirm Rejection",
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._updateStatus("R", "Rejected", sRemarks);
					}
				}
			});
		},

		/**
		 * Fired when Store User clicks 'Amendment' button.
		 * Opens a dialog prompting for a mandatory Amendment Reason.
		 */
		onAmend: function () {
			var that = this;
			var sExistingRemarks = this.getView().getModel("store").getProperty("/STORERemarks") ||
			                       this.getView().getModel("store").getProperty("/StoreRemarks") || "";

			var oReasonInput = new sap.m.TextArea({
				value: sExistingRemarks,
				placeholder: "Enter reason for sending back for amendment...",
				rows: 4,
				width: "100%",
				liveChange: function (oEvent) {
					var sText = oEvent.getParameter("value");
					if (that._oAmendDialog) {
						that._oAmendDialog.getBeginButton().setEnabled(sText.trim().length > 0);
					}
				}
			});

			this._oAmendDialog = new sap.m.Dialog({
				title: "Amendment Reason",
				type: sap.m.DialogType.Message,
				content: [
					new sap.m.Label({ text: "Please enter the reason for Amendment:", required: true }),
					oReasonInput
				],
				beginButton: new sap.m.Button({
					type: sap.m.ButtonType.Emphasized,
					text: "Submit",
					enabled: sExistingRemarks.trim().length > 0,
					press: function () {
						var sReason = oReasonInput.getValue().trim();
						that._oAmendDialog.close();

						// Sync reason to local model properties
						var oStoreModel = that.getView().getModel("store");
						if (oStoreModel) {
							oStoreModel.setProperty("/STORERemarks", sReason);
							oStoreModel.setProperty("/StoreRemarks", sReason);
						}

						// Execute backend OData status update
						that._updateStatus("AM", "Amendment", sReason);
					}
				}),
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () {
						if (that._oAmendDialog) {
							that._oAmendDialog.close();
						}
					}
				}),
				afterClose: function () {
					if (that._oAmendDialog) {
						that._oAmendDialog.destroy();
						that._oAmendDialog = null;
					}
				}
			});

			this.getView().addDependent(this._oAmendDialog);
			this._oAmendDialog.open();
		},

		/* =========================================================== */
		/* BACKEND STATUS UPDATE & PAYLOAD BUILDING                    */
		/* =========================================================== */

		/**
		 * Sends decision (Approve/Reject/Amendment) to backend SAP OData service.
		 */
		_updateStatus: function (sApprovalCode, sDisplayStatus, sRemarks) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			var that = this;
			BusyIndicator.show(0);

			// Build complete payload structure matching HOD controller design pattern
			var oPayload = this._buildApprovalPayload(oODataModel, sApprovalCode, sRemarks);

			oODataModel.create("/GatePassReqHdrSet", oPayload, {
				success: function (oData) {
					BusyIndicator.hide();
					var oStoreModel = that.getView().getModel("store");
					if (oStoreModel) {
						oStoreModel.setProperty("/Status", sDisplayStatus);
					}

					var sMsg = (oData && oData.Message) || ("Request " + sDisplayStatus + " successfully.");
					MessageBox.success(sMsg, {
						onClose: function () {
							if (oODataModel.refresh) {
								oODataModel.refresh(true);
							}
							that.getRouter().navTo("GatePassList");
						}
					});
				},
				error: function (oError) {
					BusyIndicator.hide();
					MessageBox.error(that._extractODataErrorMessage(oError));
				}
			});
		},

		/**
		 * Builds full CREATE payload structure from raw row data + Store decision.
		 */
		_buildApprovalPayload: function (oODataModel, sApprovalCode, sRemarks) {
			var oRaw = this._oRawData || {};
			var aRawItems = (oRaw.GateReqItmNav && oRaw.GateReqItmNav.results) ||
			                (oRaw.GateReqItemNav && oRaw.GateReqItemNav.results) || [];

			var oStoreModel = this.getView().getModel("store");
			var sFname1 = this._stripExtension(oStoreModel ? (oStoreModel.getProperty("/Fname") || "") : "");
			var sFname2 = this._stripExtension(oStoreModel ? (oStoreModel.getProperty("/Fname2") || "") : "");

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
				Approval1:      sApprovalCode === "AM" ? (oRaw.Approval1 || "") : "",
				Approval2:      sApprovalCode === "AM" ? "AM" : sApprovalCode,
				StoreAmmend:    sApprovalCode === "AM" ? "AM" : "",
				Department:     oRaw.Department     || "",
				VehicleNo:      oRaw.VehicleNo      || "",
				ModeOfDispatch: oRaw.ModeOfDispatch || "",
				Remarks:        oRaw.Remarks        || "",
				ReturnableDate: oRaw.ReturnableDate || "",
				HODRemarks:     oStoreModel ? (oStoreModel.getProperty("/HODRemarks") || "") : "",
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

			// Dynamic metadata lookup for attachments
			var fnFindProp = this._buildMetadataPropertyFinder(oODataModel);

			oPayload[fnFindProp("Base64Img1", "Base64img1") || "Base64Img1"] =
				this._getRawBase64FromModel(oStoreModel ? oStoreModel.getProperty("/Base64Img1") : "");
			oPayload[fnFindProp("FILENAME", "Filename", "FileName", "Fname") || "Fname"] = sFname1;
			oPayload[fnFindProp("FILETYPE", "Filetype", "FileType", "Ftype") || "Ftype"] =
				oStoreModel ? (oStoreModel.getProperty("/Ftype") || "") : "";

			oPayload[fnFindProp("Base64Img2", "Base64img2") || "Base64Img2"] =
				this._getRawBase64FromModel(oStoreModel ? oStoreModel.getProperty("/Base64Img2") : "");
			oPayload[fnFindProp("FILENAME2", "Filename2", "FileName2", "Fname2") || "Fname2"] = sFname2;
			oPayload[fnFindProp("FILETYPE2", "Filetype2", "FileType2", "Ftype2") || "Ftype2"] =
				oStoreModel ? (oStoreModel.getProperty("/Ftype2") || "") : "";

			return oPayload;
		},

		/**
		 * Helper to find actual metadata property names for case-insensitive fallback.
		 */
		_buildMetadataPropertyFinder: function (oODataModel) {
			var oMetadata = oODataModel ? oODataModel.getServiceMetadata() : null;
			var aEntityProperties = [];

			if (oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema) {
				oMetadata.dataServices.schema.forEach(function (oSchema) {
					(oSchema.entityType || []).forEach(function (oEntityType) {
						if (oEntityType.name && oEntityType.name.indexOf("GatePassReqHdr") !== -1) {
							aEntityProperties = oEntityType.property || [];
						}
					});
				});
			}

			return function () {
				var aCandidates = Array.prototype.slice.call(arguments);
				for (var i = 0; i < aCandidates.length; i++) {
					var sCand = aCandidates[i];
					var oExact = aEntityProperties.find(function (p) { return p.name === sCand; });
					if (oExact) return oExact.name;

					var oCi = aEntityProperties.find(function (p) {
						return p.name.toLowerCase() === sCand.toLowerCase();
					});
					if (oCi) return oCi.name;
				}
				return null;
			};
		},

		/**
		 * Helper to extract human-readable error messages from OData error responses.
		 */
		_extractODataErrorMessage: function (oError) {
			var sMsg = "Failed to update request status.";
			if (!oError) return sMsg;

			try {
				var oBody = JSON.parse(oError.responseText);
				var aInner = oBody.error && oBody.error.innererror && oBody.error.innererror.errordetails;
				if (aInner && aInner[0] && aInner[0].message) {
					return aInner[0].message;
				}
				if (oBody.error && oBody.error.message && oBody.error.message.value) {
					return oBody.error.message.value;
				}
			} catch (e) {
				if (typeof oError.responseText === "string" && oError.responseText.trim()) {
					return oError.responseText;
				}
			}
			return sMsg;
		},

		_stripExtension: function (sFilename) {
			if (!sFilename) return "";
			var iDot = sFilename.lastIndexOf(".");
			return iDot !== -1 ? sFilename.substring(0, iDot) : sFilename;
		},

		/* =========================================================== */
		/* ATTACHMENTS & UTILITIES                                    */
		/* =========================================================== */

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

		onDownloadAttachment1: function () {
			this._downloadAttachmentFile(1);
		},

		onDownloadAttachment2: function () {
			this._downloadAttachmentFile(2);
		},

		_downloadAttachmentFile: function (index) {
			var oModel = this.getView().getModel("store");
			var suffix = index === 2 ? "2" : "";
			var sBase64 = oModel.getProperty("/Base64Img" + index);
			var sFname = oModel.getProperty("/Fname" + suffix) || ("Attachment_" + index);
			var sFtype = (oModel.getProperty("/Ftype" + suffix) || "JPG").toUpperCase();

			if (!sBase64) return;

			var sMime = "image/jpeg";
			if (sFtype === "PDF") sMime = "application/pdf";
			else if (sFtype === "DOCX") sMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
			else if (sFtype === "DOC") sMime = "application/msword";
			else if (sFtype === "PNG") sMime = "image/png";

			var sPureBase64 = sBase64;
			if (sBase64.indexOf("base64,") !== -1) {
				sPureBase64 = sBase64.split("base64,")[1];
			}

			try {
				var byteCharacters = atob(sPureBase64);
				var byteNumbers = new Array(byteCharacters.length);
				for (var i = 0; i < byteCharacters.length; i++) {
					byteNumbers[i] = byteCharacters.charCodeAt(i);
				}
				var byteArray = new Uint8Array(byteNumbers);
				var blob = new Blob([byteArray], { type: sMime });
				
				var sFileNameWithExt = sFname;
				if (sFileNameWithExt.indexOf(".") === -1) {
					sFileNameWithExt += "." + sFtype.toLowerCase();
				}

				if (window.navigator && window.navigator.msSaveOrOpenBlob) {
					window.navigator.msSaveOrOpenBlob(blob, sFileNameWithExt);
				} else {
					var link = document.createElement('a');
					link.href = window.URL.createObjectURL(blob);
					link.download = sFileNameWithExt;
					if (sFtype === "PDF") {
						window.open(link.href, "_blank");
					} else {
						document.body.appendChild(link);
						link.click();
						document.body.removeChild(link);
					}
				}
			} catch (e) {
				MessageBox.error("Failed to open or download attachment: " + e.message);
			}
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
					
					var pdfIdx  = upper.indexOf("25504446");
					var docxIdx = upper.indexOf("504B0304");
					var jpegIdx = upper.indexOf("FFD8FF");
					var pngIdx  = upper.indexOf("89504E47");
					var gifIdx  = upper.indexOf("47494638");

					var indices = [
						{ mime: "application/pdf", idx: pdfIdx },
						{ mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", idx: docxIdx },
						{ mime: "image/jpeg", idx: jpegIdx   },
						{ mime: "image/png",  idx: pngIdx },
						{ mime: "image/gif",  idx: gifIdx }
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
			
			var iPdf = sB64.indexOf("JVBERi");
			var iDocx = sB64.indexOf("UEsDB");
			var iJpeg = sB64.indexOf("/9j/");
			var iPng  = sB64.indexOf("iVBORw");

			if (iPdf !== -1) { return "data:application/pdf;base64," + sB64.substring(iPdf); }
			if (iDocx !== -1) { return "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + sB64.substring(iDocx); }
			if (iJpeg !== -1) { return "data:image/jpeg;base64," + sB64.substring(iJpeg); }
			if (iPng  !== -1) { return "data:image/png;base64,"  + sB64.substring(iPng);  }
			
			return "data:image/jpeg;base64," + sB64;
		},

		_detectFileType: function (sRawImg) {
			if (!sRawImg) return "";
			var sClean = sRawImg.trim().replace(/[\n\r\s]/g, "");
			var iComma = sClean.indexOf("base64,");
			var sDetectStr = iComma !== -1 ? sClean.substring(iComma + 7) : sClean;
			var sPossibleHex = sDetectStr.replace(/^0x/i, "");
			
			if (sDetectStr.indexOf("JVBERi") !== -1 || sPossibleHex.indexOf("25504446") !== -1) {
				return "PDF";
			} else if (sDetectStr.indexOf("iVBORw") !== -1 || sPossibleHex.indexOf("89504E47") !== -1) {
				return "PNG";
			} else if (sDetectStr.indexOf("/9j/") !== -1 || sPossibleHex.indexOf("FFD8FF") !== -1) {
				return "JPG";
			} else if (sDetectStr.indexOf("UEsDB") !== -1 || sPossibleHex.indexOf("504B0304") !== -1) {
				return "DOCX";
			}
			return "";
		},

		_getRawBase64FromModel: function (sDataUrl) {
			if (!sDataUrl) return "";
			var iComma = sDataUrl.indexOf("base64,");
			if (iComma !== -1) {
				return sDataUrl.substring(iComma + 7);
			}
			return sDataUrl;
		},

		onNavBack: function () {
			this.getRouter().navTo("GatePassList");
		}

	});
});
